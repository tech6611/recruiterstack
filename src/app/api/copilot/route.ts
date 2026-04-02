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
import { COPILOT_TOOLS, executeTool } from '@/lib/copilot-tools'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import { trackUsage } from '@/lib/ai/track-usage'

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
    // Extended action tools
    create_candidate:          '👤 Creating candidate...',
    update_candidate_status:   '🔄 Updating candidate status...',
    update_application_status: '📋 Updating application status...',
    bulk_move_to_stage:        '➡️  Moving candidates to stage...',
    bulk_reject_below_score:   '🚫 Rejecting low-score applicants...',
    get_application_events:    '📜 Fetching activity history...',
    update_job:                '✏️  Updating job details...',
    get_scorecard:             '🗒️  Loading scorecard...',
    // Gap-fill tools
    list_roles:                '📂 Loading roles...',
    create_role:               '🆕 Creating role...',
    update_role:               '✏️  Updating role...',
    get_recruiting_analytics:  '📈 Pulling analytics...',
    get_inbox:                 '📬 Loading inbox...',
    create_scorecard:          '📝 Logging scorecard...',
    draft_application_email:   '✍️  Drafting email...',
    create_intake_request:     '📋 Creating intake request...',
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

  const systemPrompt = `You are an AI recruiting copilot inside RecruiterStack, a modern ATS. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

You help recruiters manage their full recruiting workflow end-to-end.
- Be concise and direct. Prefer bullet points over prose when listing data.
- Always use names (not IDs) in your responses — IDs are for tool calls only.
- When you complete a write action (move stage, add note, reject, hire), confirm briefly what you did.
- If you're unsure which candidate or job the recruiter means, ask for clarification rather than guessing.
- If asked to do something you have no tool for, say so clearly and suggest what the recruiter can do in the app instead.

CAPABILITIES (what you can do):
- Query: search candidates, get pipeline, list jobs, get stats, find stale apps, get candidate profile, view activity history, view scorecards, get inbox/activity feed, get analytics, list roles
- Write (single): move stage, add note, create candidate, update candidate status, update application status (reject/hire/withdraw), update job, create/update roles, log interview scorecard, create intake request
- Bulk write: add candidates to pipeline, AI-score applications, bulk move to stage, bulk reject below score, send outreach emails
- Draft: generate interview invite / rejection / offer / follow-up emails for any application
- Orchestrate: create job + pipeline, source candidates, run full hiring workflows

BEHAVIOR MODES:

1. SIMPLE QUERIES (lookup, single action):
   Execute immediately. No plan needed.
   Examples: "Show me active jobs", "Move John to interview stage", "What's stale?"

2. COMPLEX GOALS (multi-step workflows, hiring initiatives):
   First, ask clarifying questions if critical info is missing (role level, location, hiring manager, tech stack, etc.) — never guess required fields.
   Then generate a structured plan covering the ENTIRE workflow end-to-end. Embed it in your response exactly like this:

   <!-- PLAN: {"summary":"...","steps":[{"number":1,"description":"...","tools":["tool_name"],"needs_approval":false,"status":"pending"},{"number":2,"description":"...","tools":["tool_name"],"needs_approval":true,"status":"pending"}]} -->

   Then call request_approval so the recruiter can review, edit, and approve the plan before execution.

   Plan rules:
   - Cover the full funnel: job creation → sourcing → scoring → outreach → screens → interviews → offers
   - Mark needs_approval: true for: sending emails, creating jobs, bulk actions (3+ candidates), rejections, offers, scheduling interviews
   - Steps depending on async results (phone screens, interview feedback) use "status": "queued" with a "depends_on" field explaining the dependency
   - Keep step descriptions concise but specific (include numbers, names, criteria)

3. AFTER PLAN APPROVAL:
   Execute each step sequentially, reporting progress. Pause at steps with needs_approval: true and call request_approval before proceeding.
   If the user edited the plan, follow their edited version exactly.
   After completing all executable steps, summarize what was accomplished and note any queued steps with their dependencies.

APPROVAL GATES — always call request_approval before:
- Sending any emails
- Creating jobs
- Bulk actions affecting 3+ candidates
- Rejecting or withdrawing candidates
- Creating offers
- Scheduling interviews

EMAILS — DRAFTING vs SENDING:
- draft_application_email ONLY generates text — it does NOT send anything.
- send_outreach_email ACTUALLY sends via SendGrid.
- To send any email (offer, rejection, interview invite, follow-up): first call draft_application_email to generate the content, then call send_outreach_email with that subject and body to deliver it. Never tell the user an email was sent if you only drafted it.
- When calling send_outreach_email, YOU write the subject and body — warm, professional, personalized to the candidate's specific skills/title and how they match the role. 3-4 short paragraphs.

search_candidate_pool returns internal candidates only. If the pool is too small, tell the recruiter and suggest they add candidates via the app.`

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
          trackUsage('copilot', 'claude-opus-4-6', finalMsg.usage)
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

            const result = await executeTool(tc.name, parsedInput, orgId, supabase)
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
