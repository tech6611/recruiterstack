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
import {
  CopilotTurn,
  copilotConfig,
  functionResultsContent,
  messagesToContents,
} from '@/lib/ai/llm'

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
    delegate_to_payroll: '🤝 Asking the payroll agent...',
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
              send({ type: 'tool_start', id: ev.id, name: ev.name, label: toolLabel(ev.name) })
            }
          }

          trackUsage('copilot', turn.model, turn.usage)
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
              model: MODEL, orgId, supabase, capabilities,
            })
            send({ type: 'tool_done', id: call.id, name: call.name, summary: toolSummary(call.name, result) })
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
