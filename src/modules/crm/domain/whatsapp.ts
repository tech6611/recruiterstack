import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  WhatsAppAccount,
  WhatsAppConversation,
  WhatsAppConversationStatus,
  WhatsAppMessage,
  WhatsAppMessageInsert,
  WhatsAppMessageStatus,
} from '@/lib/types/database'
import { encrypt, decryptSafe } from '@/lib/crypto'
import { digitsOnly } from '@/lib/whatsapp/phone'

type Supabase = SupabaseClient<Database>

// Meta's 24h customer-service window: free-form messages are only deliverable
// within 24h of the candidate's last inbound message; outside it, only
// pre-approved templates go through.
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000

// Account with secrets decrypted, ready for Graph API calls.
export interface WhatsAppCredentials {
  phoneNumberId: string
  wabaId: string
  accessToken: string
  appSecret: string | null
  displayPhone: string | null
  outreachTemplate: string | null
  templateLanguage: string
  status: WhatsAppAccount['status']
}

export interface WhatsAppAccountInput {
  phoneNumberId: string
  wabaId: string
  displayPhone?: string | null
  accessToken: string
  appSecret?: string | null
  outreachTemplate?: string | null
  templateLanguage?: string
}

function toCredentials(row: WhatsAppAccount): WhatsAppCredentials {
  return {
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    accessToken: decryptSafe(row.access_token) ?? row.access_token,
    appSecret: row.app_secret ? (decryptSafe(row.app_secret) ?? row.app_secret) : null,
    displayPhone: row.display_phone,
    outreachTemplate: row.outreach_template,
    templateLanguage: row.template_language,
    status: row.status,
  }
}

export async function getWhatsAppAccount(
  supabase: Supabase,
  orgId: string,
): Promise<WhatsAppCredentials | null> {
  const { data, error } = await supabase
    .from('whatsapp_accounts')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  return data ? toCredentials(data as WhatsAppAccount) : null
}

// Webhook routing: Meta identifies the recipient business number by
// phone_number_id; map it back to the org that owns it.
export async function findAccountByPhoneNumberId(
  supabase: Supabase,
  phoneNumberId: string,
): Promise<{ orgId: string; credentials: WhatsAppCredentials } | null> {
  const { data, error } = await supabase
    .from('whatsapp_accounts')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  const row = data as WhatsAppAccount
  return { orgId: row.org_id, credentials: toCredentials(row) }
}

export async function upsertWhatsAppAccount(
  supabase: Supabase,
  orgId: string,
  input: WhatsAppAccountInput,
): Promise<void> {
  const { error } = await supabase.from('whatsapp_accounts').upsert(
    {
      org_id: orgId,
      phone_number_id: input.phoneNumberId,
      waba_id: input.wabaId,
      display_phone: input.displayPhone ?? null,
      access_token: encrypt(input.accessToken),
      app_secret: input.appSecret ? encrypt(input.appSecret) : null,
      outreach_template: input.outreachTemplate ?? null,
      template_language: input.templateLanguage ?? 'en',
      status: 'connected',
      last_error: null,
    } as never,
    { onConflict: 'org_id' },
  )

  if (error) throw error
}

export async function disconnectWhatsAppAccount(supabase: Supabase, orgId: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_accounts')
    .update({ status: 'disconnected' } as never)
    .eq('org_id', orgId)

  if (error) throw error
}

export async function findConversationByPhone(
  supabase: Supabase,
  orgId: string,
  waPhone: string,
): Promise<WhatsAppConversation | null> {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('wa_phone', waPhone)
    .maybeSingle()

  if (error) throw error
  return (data as WhatsAppConversation) ?? null
}

export async function getConversationById(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<WhatsAppConversation | null> {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as WhatsAppConversation) ?? null
}

export async function findConversationByCandidate(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<WhatsAppConversation | null> {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('candidate_id', candidateId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as WhatsAppConversation) ?? null
}

export async function findOrCreateConversation(
  supabase: Supabase,
  orgId: string,
  input: {
    waPhone: string
    personId?: string | null
    candidateId?: string | null
    applicationId?: string | null
    context?: Record<string, unknown>
  },
): Promise<WhatsAppConversation> {
  const existing = await findConversationByPhone(supabase, orgId, input.waPhone)
  if (existing) {
    // Backfill linkage/context discovered later (e.g. first outreach carried
    // no application, a later one does).
    const patch: Record<string, unknown> = {}
    if (input.personId && !existing.person_id) patch.person_id = input.personId
    if (input.candidateId && !existing.candidate_id) patch.candidate_id = input.candidateId
    if (input.applicationId && !existing.application_id) patch.application_id = input.applicationId
    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .update(patch as never)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw error
      return data as WhatsAppConversation
    }
    return existing
  }

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      org_id: orgId,
      wa_phone: input.waPhone,
      person_id: input.personId ?? null,
      candidate_id: input.candidateId ?? null,
      application_id: input.applicationId ?? null,
      context: input.context ?? {},
    } as never)
    .select('*')
    .single()

  // Tolerate a concurrent insert racing UNIQUE(org_id, wa_phone).
  if (error) {
    const raced = await findConversationByPhone(supabase, orgId, input.waPhone)
    if (raced) return raced
    throw error
  }

  return data as WhatsAppConversation
}

export async function updateConversation(
  supabase: Supabase,
  orgId: string,
  id: string,
  patch: Partial<{
    status: WhatsAppConversationStatus
    agent_enabled: boolean
    last_inbound_at: string
    last_outbound_at: string
    agent_turns: number
    application_id: string | null
    context: Record<string, unknown>
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update(patch as never)
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
}

export async function recordMessage(
  supabase: Supabase,
  input: WhatsAppMessageInsert,
): Promise<WhatsAppMessage | null> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert(input as never)
    .select('*')
    .single()

  if (error) {
    // Duplicate wa_message_id → Meta webhook retry; treat as already recorded.
    if (error.code === '23505') return null
    throw error
  }

  return data as WhatsAppMessage
}

export async function updateMessageStatus(
  supabase: Supabase,
  waMessageId: string,
  status: WhatsAppMessageStatus,
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_messages')
    .update({ status, ...(errorMessage ? { error: errorMessage } : {}) } as never)
    .eq('wa_message_id', waMessageId)

  if (error) throw error
}

export async function markMessageProcessed(
  supabase: Supabase,
  messageId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_messages')
    .update({ metadata } as never)
    .eq('id', messageId)

  if (error) throw error
}

export async function getMessageById(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<WhatsAppMessage | null> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as WhatsAppMessage) ?? null
}

export async function getConversationHistory(
  supabase: Supabase,
  orgId: string,
  conversationId: string,
  limit = 20,
): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data as WhatsAppMessage[]) ?? []).reverse()
}

// Pure function so window logic is unit-testable.
export function isWithinServiceWindow(
  conversation: Pick<WhatsAppConversation, 'last_inbound_at'>,
  now: Date = new Date(),
): boolean {
  if (!conversation.last_inbound_at) return false
  return now.getTime() - new Date(conversation.last_inbound_at).getTime() < SERVICE_WINDOW_MS
}

// Outbound recipient resolution: candidate id → name + phone, preferring the
// canonical people row (Party Model) over the mirrored candidate columns.
export async function resolveCandidateRecipient(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<{ name: string | null; phone: string | null; personId: string | null }> {
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, name, phone, person_id')
    .eq('org_id', orgId)
    .eq('id', candidateId)
    .maybeSingle()

  if (!candidate) return { name: null, phone: null, personId: null }

  const cand = candidate as { name: string | null; phone: string | null; person_id: string | null }
  if (cand.person_id) {
    const { data: person } = await supabase
      .from('people')
      .select('name, phone')
      .eq('org_id', orgId)
      .eq('id', cand.person_id)
      .maybeSingle()
    const p = person as { name: string | null; phone: string | null } | null
    return {
      name: p?.name ?? cand.name,
      phone: p?.phone ?? cand.phone,
      personId: cand.person_id,
    }
  }

  return { name: cand.name, phone: cand.phone, personId: null }
}

// Inbound phone → person/candidate resolution. Meta sends wa_id as E.164
// digits without '+'; stored phones are free text, so compare on digits via
// the digits_only() SQL helper, falling back to a right-9-digit suffix match
// (national-format entries missing a country code).
export async function matchPersonByWaPhone(
  supabase: Supabase,
  orgId: string,
  waPhone: string,
): Promise<{ personId: string; candidateId: string | null } | null> {
  const digits = digitsOnly(waPhone)
  if (!digits) return null

  const { data: people, error } = await supabase
    .from('people')
    .select('id, phone')
    .eq('org_id', orgId)
    .not('phone', 'is', null)

  if (error) throw error

  const suffix = digits.slice(-9)
  const match = (people ?? []).find((p) => {
    const stored = digitsOnly((p as { phone: string }).phone)
    if (!stored) return false
    return stored === digits || (stored.length >= 9 && stored.slice(-9) === suffix)
  }) as { id: string } | undefined

  if (!match) return null

  const { data: candidate, error: candErr } = await supabase
    .from('candidates')
    .select('id')
    .eq('org_id', orgId)
    .eq('person_id', match.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (candErr) throw candErr
  return { personId: match.id, candidateId: (candidate as { id: string } | null)?.id ?? null }
}
