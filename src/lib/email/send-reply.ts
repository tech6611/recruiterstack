import sgMail from '@sendgrid/mail'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, EmailConversation } from '@/lib/types/database'
import { recordMessage, updateConversation } from '@/modules/crm/domain/email-inbox'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>

// Per-enrollment Reply-To so the candidate's reply threads straight back to
// the same enrollment (and this conversation). Mirrors job-handlers.ts.
export function replyToAddress(enrollmentId: string): string {
  const domain = process.env.SEQUENCE_REPLY_DOMAIN || 'reply.recruiterstack.in'
  return `reply+${enrollmentId}@${domain}`
}

export interface SendReplyInput {
  conversation: EmailConversation
  toEmail: string
  subject: string
  bodyText: string
  bodyHtml?: string
  // Who is sending: a Clerk user id (manual recruiter reply) or 'agent'
  // (AI auto-reply — normally sent from Django, but supported here too).
  sender: string
}

export interface SendReplyResult {
  ok: boolean
  reason?: string
  messageId?: string | null
}

// Send a recruiter's manual reply in an existing email conversation, record it
// as an outbound email_message, and stamp last_outbound_at. Returns { ok:false }
// (without throwing) when SendGrid isn't configured so the caller can surface a
// friendly message.
export async function sendConversationReply(
  supabase: Supabase,
  orgId: string,
  input: SendReplyInput,
): Promise<SendReplyResult> {
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    return { ok: false, reason: 'SendGrid is not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL).' }
  }

  const html = input.bodyHtml || input.bodyText.replace(/\n/g, '<br>')
  const replyTo = input.conversation.enrollment_id
    ? replyToAddress(input.conversation.enrollment_id)
    : undefined

  sgMail.setApiKey(apiKey)

  let messageId: string | null = null
  try {
    const [response] = await sgMail.send({
      to: input.toEmail,
      from: { email: fromEmail, name: 'RecruiterStack' },
      ...(replyTo ? { replyTo } : {}),
      subject: input.subject,
      html,
      text: input.bodyText,
      trackingSettings: {
        openTracking: { enable: true },
        clickTracking: { enable: true, enableText: false },
      },
      ...(input.conversation.enrollment_id
        ? { customArgs: { seq_enrollment_id: input.conversation.enrollment_id } }
        : {}),
    })
    messageId = response?.headers?.['x-message-id'] ?? null
  } catch (err) {
    logger.error('Conversation reply send failed', err, {
      conversationId: input.conversation.id,
      orgId,
    })
    return { ok: false, reason: 'The email failed to send. Please try again.' }
  }

  const now = new Date().toISOString()
  await recordMessage(supabase, {
    conversation_id: input.conversation.id,
    org_id: orgId,
    direction: 'outbound',
    from_email: fromEmail,
    to_email: input.toEmail,
    subject: input.subject,
    body_text: input.bodyText,
    body_html: html,
    sendgrid_message_id: messageId,
    status: 'sent',
    sender: input.sender,
  })

  await updateConversation(supabase, orgId, input.conversation.id, {
    last_outbound_at: now,
    // A recruiter answering clears the unread flag and re-opens the thread.
    unread: false,
    status: input.conversation.status === 'closed' ? 'active' : input.conversation.status,
  })

  return { ok: true, messageId }
}
