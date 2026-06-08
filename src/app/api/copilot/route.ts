/**
 * POST /api/copilot
 *
 * Streaming AI recruiter copilot — manual agentic loop with SSE output.
 *
 * Receives: { messages: { role: "user"|"assistant"; content: string }[] }
 *
 * Streams SSE:
 *   { type: "text",        delta: string }
 *   { type: "tool_start",  id: string, name: string, label: string }
 *   { type: "tool_done",   id: string, name: string, summary: string }
 *   { type: "checkpoint",  action_summary: string, details: string, impact: string }
 *   { type: "done" }
 *   { type: "error",       message: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import {
  ORCHESTRATOR_TOOLS,
  ORCHESTRATOR_SYSTEM_PROMPT,
  executeOrchestratorTool,
} from '@/lib/agents/orchestrator'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import { trackUsage } from '@/lib/ai/track-usage'

const MODEL = 'claude-opus-4-6'

export const maxDuration = 120

// ── Human-readable labels for in-progress tool chips ─────────────────────────
// The orchestrator only exposes delegate + approval tools to the UI; the inner
// sub-agent's tool calls happen non-streamed inside runSubAgent.
function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    delegate_to_ats:   '🤝 Asking the recruiting agent...',
    delegate_to_hris:  '🤝 Asking the HRIS agent...',
    delegate_to_crm:   '🤝 Asking the CRM agent...',
    request_approval:  '⏸️  Awaiting your approval...',
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

  const rateLimited = await checkAuthRateLimit(orgId, { maxRequests: 20, window: '60 s' })
  if (rateLimited) return rateLimited

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
        for (let iteration = 0; iteration < 15; iteration++) {
          const claudeStream = client.messages.stream({
            model:    MODEL,
            max_tokens: 4096,
            thinking: { type: 'adaptive' },
            system:   ORCHESTRATOR_SYSTEM_PROMPT,
            tools:    ORCHESTRATOR_TOOLS,
            messages: conversationMessages,
          })

          const toolCalls: { id: string; name: string; inputJson: string }[] = []
          let currentToolCall: { id: string; name: string; inputJson: string } | null = null
          let stopReason = ''
          let textBuffer = ''

          for await (const event of claudeStream) {
            // ── Block starts ──────────────────────────────────────────────────
            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'tool_use') {
                currentToolCall = {
                  id:        event.content_block.id,
                  name:      event.content_block.name,
                  inputJson: '',
                }
                send({ type: 'tool_start', id: currentToolCall.id, name: currentToolCall.name, label: toolLabel(currentToolCall.name) })
              }
            }

            // ── Deltas ────────────────────────────────────────────────────────
            if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                send({ type: 'text', delta: event.delta.text })
                textBuffer += event.delta.text
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
          trackUsage('copilot', MODEL, finalMsg.usage)
          conversationMessages.push({ role: 'assistant', content: finalMsg.content })

          // ── Plan detection — look for <!-- PLAN: {...} --> in text output ──
          const planMatch = textBuffer.match(/<!-- PLAN: ([\s\S]*?) -->/)
          if (planMatch) {
            try {
              const planData = JSON.parse(planMatch[1])
              send({ type: 'plan', summary: planData.summary ?? '', steps: planData.steps ?? [] })
            } catch { /* ignore malformed plan JSON */ }
          }

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

            const result = await executeOrchestratorTool(tc.name, parsedInput, {
              client, model: MODEL, orgId, supabase,
            })
            send({ type: 'tool_done', id: tc.id, name: tc.name, summary: toolSummary(tc.name, result) })

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
