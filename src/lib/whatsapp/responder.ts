/**
 * WhatsApp responder agent — handles inbound candidate messages.
 *
 * Runs as the `whatsapp_inbound` job handler (queued by the webhook). Guardrails
 * short-circuit before any model call: opt-out keywords, unknown senders,
 * muted/escalated conversations, and a per-conversation turn cap. Everything
 * else goes to a bounded Haiku agent loop that replies via send_whatsapp_reply
 * or hands off via escalate_to_recruiter.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { notify } from '@/lib/notifications'
import { COPILOT_TOOLS } from '@/lib/copilot-tools'
import { runSubAgent } from '@/lib/agents/sub-agent'
import type { QueuedJob } from '@/lib/api/job-queue'
import type { WhatsAppConversation, WhatsAppMessage } from '@/lib/types/database'
import {
  getConversationById,
  getConversationHistory,
  getMessageById,
  markMessageProcessed,
  updateConversation,
} from '@/modules/crm/domain/whatsapp'
import { sendWhatsApp } from './send'

const RESPONDER_MODEL = 'claude-haiku-4-5-20251001'
const MAX_AGENT_TURNS = 10
const MAX_LOOP_ITERATIONS = 4
const OPT_OUT_RE = /^\s*(stop|unsubscribe|opt\s*out)\s*[.!]?\s*$/i

const RESPONDER_TOOL_NAMES = new Set([
  'get_candidate',
  'get_application_events',
  'add_note_to_application',
  'send_whatsapp_reply',
  'escalate_to_recruiter',
])

export const WHATSAPP_RESPONDER_TOOLS = COPILOT_TOOLS.filter((t) =>
  RESPONDER_TOOL_NAMES.has(t.name),
)

function responderSystemPrompt(conversation: WhatsAppConversation): string {
  const context = conversation.context ?? {}
  return `You are a recruiting assistant replying to a job candidate on WhatsApp on behalf of ${context.company_name ?? 'the hiring company'}.${context.job_title ? ` The conversation is about the "${context.job_title}" role.` : ''}

STYLE: WhatsApp, not email. Short (1-3 sentences), warm, plain text. No markdown, no bullet lists, no signatures. One message per turn.

HARD RULES:
- You MUST end by calling exactly one of: send_whatsapp_reply (your reply) or escalate_to_recruiter (hand off to a human). Never both, never neither.
- Never promise, negotiate, or discuss compensation, offers, or start dates — escalate instead.
- Never share information about other candidates or internal evaluations (scores, notes).
- Never fabricate details about the role or company. If the answer isn't in the conversation or candidate context, escalate.
- Escalate immediately if the candidate asks for a human, seems frustrated or upset, or raises anything legal/sensitive.
- If the candidate asks to stop receiving messages, escalate (opt-out is handled upstream, but treat repeats with respect).
- Use get_candidate / get_application_events for context when useful — IDs are in the task. Use add_note_to_application to record important facts the candidate shares (availability, notice period, expectations).`
}

function renderTranscript(messages: WhatsAppMessage[]): string {
  return messages
    .map((m) => `[${m.direction === 'inbound' ? 'candidate' : 'us'}] ${m.body ?? `(template: ${m.template_name})`}`)
    .join('\n')
}

async function notifyRecruiter(
  orgId: string,
  title: string,
  body: string,
  conversationId: string,
): Promise<void> {
  await notify({
    orgId,
    type: 'system',
    title,
    body,
    slackText: `📱 ${title}: ${body}`,
    resourceType: 'whatsapp_conversation',
    resourceId: conversationId,
  })
}

export async function handleWhatsAppInbound(job: QueuedJob): Promise<void> {
  const { messageId, conversationId } = job.payload as {
    messageId: string
    conversationId: string
  }
  if (!messageId || !conversationId) throw new Error('Missing messageId or conversationId')

  const supabase = createAdminClient()
  const orgId = job.org_id

  const [message, conversation] = await Promise.all([
    getMessageById(supabase, orgId, messageId),
    getConversationById(supabase, orgId, conversationId),
  ])

  if (!message || !conversation) {
    logger.warn('[whatsapp-responder] message or conversation not found', { messageId, conversationId })
    return
  }

  // Never respond to our own messages; never double-process (job retries
  // after a successful send must not produce a second reply).
  if (message.direction !== 'inbound') return
  if (message.metadata?.processed) return

  const markProcessed = (outcome: string) =>
    markMessageProcessed(supabase, messageId, { ...message.metadata, processed: true, outcome })

  const body = (message.body ?? '').trim()

  // ── Opt-out ──────────────────────────────────────────────────────────────
  if (OPT_OUT_RE.test(body)) {
    // Send the confirmation BEFORE flipping status — sendWhatsApp refuses
    // opted-out conversations.
    await sendWhatsApp({
      supabase,
      orgId,
      toPhone: conversation.wa_phone,
      applicationId: conversation.application_id ?? undefined,
      body: "You won't receive further messages from us. Thanks for letting us know.",
      sender: 'agent:responder',
    })
    await updateConversation(supabase, orgId, conversationId, {
      status: 'opted_out',
      agent_enabled: false,
    })
    if (conversation.application_id) {
      await supabase.from('application_events').insert({
        application_id: conversation.application_id,
        event_type: 'whatsapp_opt_out',
        note: 'Candidate opted out of WhatsApp messages.',
        created_by: 'agent:responder',
      } as never)
    }
    await notifyRecruiter(orgId, 'WhatsApp opt-out', `A candidate opted out of WhatsApp messages ("${body}").`, conversationId)
    await markProcessed('opted_out')
    return
  }

  // ── Unknown sender: store + escalate, never auto-reply ───────────────────
  if (!conversation.person_id && !conversation.candidate_id) {
    await updateConversation(supabase, orgId, conversationId, {
      status: 'escalated',
      agent_enabled: false,
    })
    await notifyRecruiter(
      orgId,
      'WhatsApp message from unknown number',
      `${conversation.wa_phone}: "${body.slice(0, 200)}"`,
      conversationId,
    )
    await markProcessed('unknown_sender')
    return
  }

  // ── Muted / escalated / closed: store + notify only ──────────────────────
  if (!conversation.agent_enabled || conversation.status !== 'active') {
    await notifyRecruiter(
      orgId,
      'New WhatsApp reply (AI responder off)',
      `"${body.slice(0, 200)}"`,
      conversationId,
    )
    await markProcessed('agent_disabled')
    return
  }

  // ── Turn cap ──────────────────────────────────────────────────────────────
  if (conversation.agent_turns >= MAX_AGENT_TURNS) {
    await sendWhatsApp({
      supabase,
      orgId,
      toPhone: conversation.wa_phone,
      applicationId: conversation.application_id ?? undefined,
      body: 'Thanks for the conversation! A recruiter from our team will follow up with you shortly.',
      sender: 'agent:responder',
    })
    await updateConversation(supabase, orgId, conversationId, {
      status: 'escalated',
      agent_enabled: false,
    })
    await notifyRecruiter(
      orgId,
      'WhatsApp conversation hit the AI turn limit',
      'The AI responder reached its turn cap — please take over the conversation.',
      conversationId,
    )
    await markProcessed('turn_cap')
    return
  }

  // ── Run the responder agent ───────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    logger.warn('[whatsapp-responder] GEMINI_API_KEY not set; storing message without reply')
    await notifyRecruiter(orgId, 'New WhatsApp reply', `"${body.slice(0, 200)}"`, conversationId)
    await markProcessed('no_api_key')
    return
  }

  const history = await getConversationHistory(supabase, orgId, conversationId, 20)

  const task = `A candidate just sent a new WhatsApp message. Read the conversation and respond.

CONTEXT IDS (for tool calls):
- conversation_id: ${conversationId}
${conversation.candidate_id ? `- candidate_id: ${conversation.candidate_id}` : ''}
${conversation.application_id ? `- application_id: ${conversation.application_id}` : ''}

CONVERSATION SO FAR (oldest first; the last [candidate] line is the new message):
${renderTranscript(history)}

Reply to the candidate now via send_whatsapp_reply, or escalate via escalate_to_recruiter.`

  const result = await runSubAgent({
    model: RESPONDER_MODEL,
    tools: WHATSAPP_RESPONDER_TOOLS,
    systemPrompt: responderSystemPrompt(conversation),
    task,
    orgId,
    supabase,
    maxIterations: MAX_LOOP_ITERATIONS,
  })

  await updateConversation(supabase, orgId, conversationId, {
    agent_turns: conversation.agent_turns + 1,
  })
  await markProcessed('responded')

  if (conversation.application_id) {
    await supabase.from('application_events').insert({
      application_id: conversation.application_id,
      event_type: 'whatsapp_received',
      note: `Candidate: "${body.slice(0, 140)}"`,
      created_by: 'candidate',
    } as never)
  }

  logger.info('[whatsapp-responder] handled inbound message', {
    conversationId,
    messageId,
    agentSummary: result.slice(0, 120),
  })
}
