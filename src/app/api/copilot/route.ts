/**
 * POST /api/copilot
 *
 * Streaming AI recruiter copilot — manual agentic loop with SSE output.
 *
 * Receives: { messages: { role: "user"|"assistant"; content: string }[] }
 *
 * Streams SSE:
 *   { type: "text",        delta: string }
 *   { type: "tool_start",  name: string, label: string }
 *   { type: "tool_done",   name: string, summary: string }
 *   { type: "checkpoint",  action_summary: string, details: string, impact: string }
 *   { type: "done" }
 *   { type: "error",       message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { COPILOT_TOOLS, executeTool } from '@/lib/copilot-tools'

export const maxDuration = 120

// ── Human-readable labels for in-progress tool chips ─────────────────────────
function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    search_candidates:         '🔍 Searching candidates...',
    get_job_pipeline:          '📋 Fetching pipeline...',
    list_jobs:                 '📄 Loading jobs...',
    get_dashboard_stats:       '📊 Getting stats...',
    find_stale_applications:   '⏰ Checking for stale applications...',
    get_candidate:             '👤 Looking up candidate...',
    move_application_to_stage: '➡️  Moving to stage...',
    add_note_to_application:   '📝 Adding note...',
    // Autonomous workflow tools
    create_job_and_pipeline:   '🏗️  Creating job & pipeline...',
    search_candidate_pool:     '🔎 Sourcing candidates...',
    bulk_add_to_pipeline:      '➕ Adding candidates to pipeline...',
    bulk_score_applications:   '🤖 AI scoring applicants...',
    send_outreach_email:       '✉️  Sending outreach email...',
    request_approval:          '⏸️  Awaiting your approval...',
  }
  return labels[name] ?? `⚙️ Running ${name}...`
}

// ── Compact summary from tool result string ────────────────────────────────
function toolSummary(name: string, result: string): string {
  // Use the first meaningful line of the result, capped at 80 chars
  const first = result.split('\n').find(l => l.trim()) ?? result
  const trimmed = first.replace(/^[•\-*]\s*/, '').trim()
  return trimmed.length > 80 ? trimmed.slice(0, 77) + '…' : trimmed
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let messages: { role: 'user' | 'assistant'; content: string }[]
  try {
    const body = await request.json()
    messages = body.messages ?? []
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!messages.length) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = `You are an AI recruiting copilot inside RecruiterStack, a modern ATS. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

You help recruiters understand their pipeline, find candidates, and take actions.
- Be concise and direct. Prefer bullet points over prose when listing data.
- Always use names (not IDs) in your responses — IDs are for tool calls only.
- When you complete a write action (move stage, add note), confirm briefly what you did.
- If you're unsure which candidate or job the recruiter means, ask for clarification rather than guessing.
- You have access to tools to query and modify the recruiter's pipeline.

AUTONOMOUS AGENT RULES (for complex multi-step goals):
- For high-level goals like "hire N engineers in [city]", plan briefly then execute tool-by-tool without waiting for confirmation between steps — EXCEPT before checkpoints.
- ALWAYS call request_approval before: sending any emails, creating jobs, or taking actions that affect 3+ candidates at once. The recruiter must approve before you proceed.
- When calling send_outreach_email: YOU write the subject and body — warm, professional, personalized to the candidate's specific skills/title and how they match the role. 3-4 short paragraphs.
- After completing a full workflow, give a 2-sentence summary: what was accomplished + recommended next action.
- search_candidate_pool returns internal candidates only. If the pool is too small, tell the recruiter and suggest they add candidates via the app.`

  const stream = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder()
      const send = (payload: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`))

      try {
        // Server-side conversation accumulates tool use/result blocks
        // Client only holds user/assistant text turns
        const conversationMessages: Anthropic.MessageParam[] = messages.map(m => ({
          role:    m.role,
          content: m.content,
        }))

        // Agentic loop — max 6 iterations to prevent runaway
        for (let iteration = 0; iteration < 6; iteration++) {
          const claudeStream = client.messages.stream({
            model:    'claude-opus-4-6',
            max_tokens: 4096,
            thinking: { type: 'adaptive' },
            system:   systemPrompt,
            tools:    COPILOT_TOOLS,
            messages: conversationMessages,
          })

          const toolCalls: { id: string; name: string; inputJson: string }[] = []
          let currentToolCall: { id: string; name: string; inputJson: string } | null = null
          let stopReason = ''

          for await (const event of claudeStream) {
            // ── Block starts ──────────────────────────────────────────────────
            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'tool_use') {
                currentToolCall = {
                  id:        event.content_block.id,
                  name:      event.content_block.name,
                  inputJson: '',
                }
                send({ type: 'tool_start', name: currentToolCall.name, label: toolLabel(currentToolCall.name) })
              }
            }

            // ── Deltas ────────────────────────────────────────────────────────
            if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                send({ type: 'text', delta: event.delta.text })
              }
              // thinking_delta is intentionally skipped — don't send to client
              if (event.delta.type === 'input_json_delta' && currentToolCall) {
                currentToolCall.inputJson += event.delta.partial_json
              }
            }

            // ── Block ends ────────────────────────────────────────────────────
            if (event.type === 'content_block_stop' && currentToolCall) {
              toolCalls.push(currentToolCall)
              currentToolCall = null
            }

            // ── Stop reason ───────────────────────────────────────────────────
            if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason ?? ''
            }
          }

          // Get the full message (includes thinking blocks for next iteration)
          const finalMsg = await claudeStream.finalMessage()
          conversationMessages.push({ role: 'assistant', content: finalMsg.content })

          // If Claude didn't request tools, we're done
          if (stopReason !== 'tool_use' || toolCalls.length === 0) break

          // ── Checkpoint detection — pause before request_approval ──────────
          const checkpointCall = toolCalls.find(tc => tc.name === 'request_approval')
          if (checkpointCall) {
            let cpInput: Record<string, string> = {}
            try { cpInput = JSON.parse(checkpointCall.inputJson || '{}') } catch { /* noop */ }
            send({
              type:           'checkpoint',
              action_summary: cpInput.action_summary ?? 'Awaiting approval',
              details:        cpInput.details         ?? '',
              impact:         cpInput.impact          ?? '',
            })
            // Do NOT execute any tools — user must approve first
            break
          }

          // ── Execute all tools and collect results ─────────────────────────
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const tc of toolCalls) {
            let parsedInput: Record<string, unknown> = {}
            try {
              parsedInput = JSON.parse(tc.inputJson || '{}')
            } catch {
              parsedInput = {}
            }

            const result = await executeTool(tc.name, parsedInput, orgId, supabase)
            send({ type: 'tool_done', name: tc.name, summary: toolSummary(tc.name, result) })

            toolResults.push({
              type:        'tool_result',
              tool_use_id: tc.id,
              content:     result,
            })
          }

          conversationMessages.push({ role: 'user', content: toolResults })
        }

        send({ type: 'done' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred'
        send({ type: 'error', message: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
