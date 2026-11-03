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
import type { Content } from '@google/genai'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getPermissionSet } from '@/lib/rbac'
import {
  ORCHESTRATOR_TOOLS,
  ORCHESTRATOR_SYSTEM_PROMPT,
  executeOrchestratorTool,
} from '@/lib/agents/orchestrator'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import { trackUsage } from '@/lib/ai/track-usage'
import { FORM_FIELD_TYPES, type FormField } from '@/components/copilot/form-spec'
import {
  CopilotTurn,
  copilotConfig,
  functionResultsContent,
  messagesToContents,
} from '@/lib/ai/llm'

const MODEL = 'gemini-2.5-pro'

export const maxDuration = 120

// ── Human-readable labels for in-progress tool chips ─────────────────────────
// The orchestrator only exposes delegate + approval tools to the UI; the inner
// sub-agent's inner tool calls are surfaced live via the onProgress hook.
function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    delegate_to_ats:   '🤝 Asking the recruiting agent...',
    delegate_to_hris:  '🤝 Asking the HRIS agent...',
    delegate_to_crm:   '🤝 Asking the CRM agent...',
    delegate_to_payroll: '🤝 Asking the payroll agent...',
    request_approval:  '⏸️  Awaiting your approval...',
    read_link:         '🔗 Reading the link...',
  }
  return labels[name] ?? `⚙️ Running ${name}...`
}

// ── Compact "done" chip summary ─────────────────────────────────────────────
// The orchestrator only executes delegate_* tools, whose result IS the
// sub-agent's full reply — which the orchestrator then relays in its own final
// text. Echoing that reply in the chip duplicates the answer, so we show a
// neutral "responded" chip instead and let the text bubble carry the content.
function toolSummary(name: string): string {
  const done: Record<string, string> = {
    delegate_to_ats:     'Recruiting agent responded',
    delegate_to_hris:    'HRIS agent responded',
    delegate_to_crm:     'CRM agent responded',
    delegate_to_payroll: 'Payroll agent responded',
    read_link:           'Read the link',
  }
  return done[name] ?? 'Done'
}

// ── Live progress chips for the sub-agent's inner tool calls ────────────────
// Turns a tool name like "create_requisition" into "Create requisition".
// A few common ones get hand-written wording; the rest are humanized.
function innerToolText(name: string): string {
  const friendly: Record<string, string> = {
    create_requisition:      'Creating requisition',
    submit_requisition:      'Submitting requisition for approval',
    list_requisitions:       'Checking existing requisitions',
    create_job_and_pipeline: 'Creating job & pipeline',
    list_jobs:               'Looking up jobs',
    search_candidates:       'Searching candidates',
    get_pipeline:            'Loading pipeline',
  }
  if (friendly[name]) return friendly[name]
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// ── Form fields from ask_user_form ───────────────────────────────────────────
// Keep only well-formed fields with a known type, so a malformed AI call can't
// break the chat window. Unknown types fall back to a plain text box.
function sanitizeFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: FormField[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const f = r as Record<string, unknown>
    const key = typeof f.key === 'string' ? f.key.trim() : ''
    if (!key || seen.has(key)) continue
    seen.add(key)
    const type = (FORM_FIELD_TYPES as readonly string[]).includes(f.type as string)
      ? (f.type as FormField['type']) : 'text'
    out.push({
      key,
      label:      typeof f.label === 'string' && f.label.trim() ? f.label.trim() : key,
      type,
      required:   f.required === true,
      default:    f.default == null ? undefined : String(f.default),
      options:    Array.isArray(f.options) ? f.options.map(String) : undefined,
      help:       typeof f.help === 'string' ? f.help : undefined,
      min_length: typeof f.min_length === 'number' ? f.min_length : undefined,
      from_source: f.from_source === true && f.default != null && String(f.default).trim() !== '' ? true : undefined,
    })
  }
  return out
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

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
  // The copilot acts as the user — its tools are gated by the user's capabilities.
  const capabilities = await getPermissionSet(supabase, orgId, userId)

  const stream = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder()
      const send = (payload: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`))

      try {
        // Server-side conversation accumulates model turns + tool results.
        // The client only holds user/assistant text turns.
        const config = copilotConfig({
          system:   ORCHESTRATOR_SYSTEM_PROMPT,
          tools:    ORCHESTRATOR_TOOLS,
          maxTokens: 4096,
        })
        const contents: Content[] = messagesToContents(messages)

        // Agentic loop — capped to prevent runaway.
        for (let iteration = 0; iteration < 15; iteration++) {
          const turn = new CopilotTurn(contents, config, MODEL)
          let textBuffer = ''

          for await (const ev of turn.stream()) {
            if (ev.type === 'text' && ev.delta) {
              send({ type: 'text', delta: ev.delta })
              textBuffer += ev.delta
            } else if (ev.type === 'call' && ev.name) {
              // The form is shown as a card, not a progress chip — a chip would
              // never get a "done" and would spin forever.
              if (ev.name !== 'ask_user_form') {
                send({ type: 'tool_start', id: ev.id, name: ev.name, label: toolLabel(ev.name) })
              }
            }
          }

          trackUsage('copilot', turn.model, turn.usage, { orgId, userId })
          contents.push(turn.modelContent)

          // ── Plan detection — look for <!-- PLAN: {...} --> in text output ──
          const planMatch = textBuffer.match(/<!-- PLAN: ([\s\S]*?) -->/)
          if (planMatch) {
            try {
              const planData = JSON.parse(planMatch[1])
              send({ type: 'plan', summary: planData.summary ?? '', steps: planData.steps ?? [] })
            } catch { /* ignore malformed plan JSON */ }
          }

          // If the model didn't request tools, we're done.
          if (turn.calls.length === 0) break

          // ── Form detection — show the click-through form and pause ────────
          // The recruiter's answers come back as the next user message.
          const formCall = turn.calls.find(c => c.name === 'ask_user_form')
          if (formCall) {
            const a = formCall.args
            send({
              type:   'form',
              intro:  typeof a.intro === 'string' ? a.intro : '',
              subject: typeof a.subject === 'string' ? a.subject : '',
              steps:  Array.isArray(a.steps) ? a.steps.filter((s): s is string => typeof s === 'string') : [],
              fields: sanitizeFormFields(a.fields),
            })
            break
          }

          // ── Checkpoint detection — pause before request_approval ──────────
          const checkpointCall = turn.calls.find(c => c.name === 'request_approval')
          if (checkpointCall) {
            const a = checkpointCall.args
            send({
              type:           'checkpoint',
              action_summary: typeof a.action_summary === 'string' ? a.action_summary : 'Awaiting approval',
              details:        typeof a.details         === 'string' ? a.details         : '',
              impact:         typeof a.impact          === 'string' ? a.impact          : '',
            })
            // Do NOT execute any tools — user must approve first
            break
          }

          // ── Execute all tools and collect results ─────────────────────────
          const toolResults: { name: string; result: string }[] = []

          for (const call of turn.calls) {
            const result = await executeOrchestratorTool(call.name, call.args, {
              model: MODEL, orgId, userId, supabase, capabilities,
              // Stream each inner step as its own chip so the recruiter sees
              // live progress instead of one long "Asking the recruiting agent…".
              onProgress: (p) => {
                const chipId = `${call.id}:${p.id}`
                const text   = innerToolText(p.name)
                if (p.phase === 'start') {
                  send({ type: 'tool_start', id: chipId, name: p.name, label: `${text}…` })
                } else {
                  send({ type: 'tool_done', id: chipId, name: p.name, summary: text })
                }
              },
            })
            send({ type: 'tool_done', id: call.id, name: call.name, summary: toolSummary(call.name) })
            toolResults.push({ name: call.name, result })
          }

          contents.push(functionResultsContent(toolResults))
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
