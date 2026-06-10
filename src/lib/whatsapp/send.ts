/**
 * Orchestrating WhatsApp sender used by copilot tools, the responder agent,
 * and the recruiter thread UI. Owns the 24h-window decision: free-form text
 * inside the window, the org's pre-approved outreach template outside it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { logger } from '@/lib/logger'
import {
  getWhatsAppAccount,
  findOrCreateConversation,
  isWithinServiceWindow,
  recordMessage,
  resolveCandidateRecipient,
  updateConversation,
  type WhatsAppCredentials,
} from '@/modules/crm/domain/whatsapp'
import { sendTextMessage, sendTemplateMessage } from './client'
import { normalizePhone } from './phone'

type Supabase = SupabaseClient<Database>

export interface SendWhatsAppOptions {
  supabase: Supabase
  orgId: string
  candidateId?: string
  applicationId?: string
  /** Explicit destination; otherwise resolved from the candidate's person record. */
  toPhone?: string
  /** Free-form message. Sent verbatim inside the 24h window. */
  body: string
  /** Params for the org's outreach template (outside-window sends). */
  templateParams?: string[]
  /** 'agent:scout' | 'agent:responder' | a user id — recorded on the message. */
  sender: string
  /** Extra context persisted on a newly created conversation (job title etc.). */
  context?: Record<string, unknown>
}

export interface SendWhatsAppResult {
  ok: boolean
  message: string
  conversationId?: string
}

// National-format numbers from CV parsers get this country code applied.
function defaultCountry(): string {
  return process.env.WHATSAPP_DEFAULT_COUNTRY ?? 'IN'
}

function deriveTemplateParams(
  body: string,
  recipientName: string | null,
  context: Record<string, unknown>,
): string[] {
  // Matches the documented `recruiter_outreach` template shape:
  // "Hi {{1}}, this is {{2}} from {{3}}. We're hiring for {{4}} ... {{5}}"
  const firstName = (recipientName ?? 'there').split(/\s+/)[0]
  return [
    firstName,
    String(context.recruiter_name ?? 'the recruiting team'),
    String(context.company_name ?? 'our company'),
    String(context.job_title ?? 'an open role'),
    String(context.apply_link ?? body.slice(0, 200)),
  ]
}

export async function sendWhatsApp(opts: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
  const { supabase, orgId, sender } = opts

  let account: WhatsAppCredentials | null
  try {
    account = await getWhatsAppAccount(supabase, orgId)
  } catch (err) {
    logger.error('[whatsapp] account lookup failed', err, { orgId })
    return { ok: false, message: 'Could not load WhatsApp configuration.' }
  }

  if (!account || account.status !== 'connected') {
    return {
      ok: false,
      message: 'WhatsApp is not configured for this organization. Connect it in Settings → Integrations.',
    }
  }

  // Resolve destination phone + identity
  let recipientName: string | null = null
  let personId: string | null = null
  let rawPhone = opts.toPhone ?? null

  if (opts.candidateId) {
    const recipient = await resolveCandidateRecipient(supabase, orgId, opts.candidateId)
    recipientName = recipient.name
    personId = recipient.personId
    rawPhone = rawPhone ?? recipient.phone
  }

  if (!rawPhone) {
    return { ok: false, message: 'Candidate has no phone number on file.' }
  }

  const waPhone = normalizePhone(rawPhone, defaultCountry())
  if (!waPhone) {
    return { ok: false, message: `"${rawPhone}" does not look like a valid phone number.` }
  }

  const conversation = await findOrCreateConversation(supabase, orgId, {
    waPhone,
    personId,
    candidateId: opts.candidateId ?? null,
    applicationId: opts.applicationId ?? null,
    context: opts.context,
  })

  if (conversation.status === 'opted_out') {
    return {
      ok: false,
      message: 'This candidate has opted out of WhatsApp messages. Not sent.',
    }
  }

  const context = { ...conversation.context, ...(opts.context ?? {}) }
  const inWindow = isWithinServiceWindow(conversation)

  let result
  let usedTemplate: string | null = null

  const sendAsTemplate = async () => {
    if (!account!.outreachTemplate) {
      return {
        ok: false as const,
        error:
          'Candidate is outside the 24-hour WhatsApp window and no outreach template is configured. Add one in Settings → Integrations → WhatsApp.',
      }
    }
    usedTemplate = account!.outreachTemplate
    const params = opts.templateParams ?? deriveTemplateParams(opts.body, recipientName, context)
    let res = await sendTemplateMessage(account!, waPhone, account!.outreachTemplate, account!.templateLanguage, params)
    // Param-count mismatch (error 100) — e.g. Meta's zero-param hello_world
    // test template. Retry once with no body params before giving up.
    if (!res.ok && res.errorCode === 100 && params.length > 0) {
      res = await sendTemplateMessage(account!, waPhone, account!.outreachTemplate, account!.templateLanguage, [])
    }
    return res
  }

  if (inWindow) {
    result = await sendTextMessage(account, waPhone, opts.body)
    // Window can lapse between our check and Meta's — fall back to template once.
    if (!result.ok && result.errorCode === 131047) {
      result = await sendAsTemplate()
    }
  } else {
    result = await sendAsTemplate()
  }

  await recordMessage(supabase, {
    conversation_id: conversation.id,
    org_id: orgId,
    direction: 'outbound',
    body: opts.body,
    template_name: usedTemplate,
    wa_message_id: 'waMessageId' in result ? (result.waMessageId ?? null) : null,
    status: result.ok ? 'sent' : 'failed',
    sender,
    error: result.ok ? null : (result.error ?? 'Unknown error'),
  })

  if (result.ok) {
    await updateConversation(supabase, orgId, conversation.id, {
      last_outbound_at: new Date().toISOString(),
      ...(Object.keys(opts.context ?? {}).length > 0 ? { context } : {}),
    })
  }

  const applicationId = opts.applicationId ?? conversation.application_id
  if (result.ok && applicationId) {
    await supabase.from('application_events').insert({
      application_id: applicationId,
      event_type: 'whatsapp_sent',
      note: usedTemplate
        ? `WhatsApp (template "${usedTemplate}"): ${opts.body.slice(0, 140)}`
        : `WhatsApp: ${opts.body.slice(0, 140)}`,
      created_by: sender,
    } as never)
  }

  if (!result.ok) {
    return { ok: false, message: `WhatsApp send failed: ${result.error}`, conversationId: conversation.id }
  }

  return {
    ok: true,
    conversationId: conversation.id,
    message: usedTemplate
      ? `Sent as template "${usedTemplate}" — candidate is outside the 24-hour window, so the free-form text was replaced by the approved template.`
      : `WhatsApp message sent${recipientName ? ` to ${recipientName}` : ''}.`,
  }
}
