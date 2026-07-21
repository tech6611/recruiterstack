import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  EmailConversation,
  EmailConversationStatus,
  EmailMessage,
  EmailMessageInsert,
  SequenceEmail,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// A single entry in a rendered conversation thread. Merges the automated
// outbound sequence emails (from `sequence_emails`) with the two-way reply
// traffic (from `email_messages`) so the UI shows one chronological history
// without the send path having to double-write into email_messages.
export interface ThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  from_email: string | null
  to_email: string | null
  subject: string | null
  body: string | null
  html: string | null
  sender: string | null // 'candidate' | 'agent' | user id | 'sequence'
  status: string | null
  created_at: string
  source: 'sequence' | 'reply'
}

// Conversation summary for the Inbox list: the conversation plus the
// candidate name and a preview of the latest message.
export interface ConversationSummary extends EmailConversation {
  candidate_name: string | null
  candidate_email: string | null
  last_message_preview: string | null
  last_message_at: string | null
}

export async function listConversations(
  supabase: Supabase,
  orgId: string,
  opts: { status?: EmailConversationStatus; limit?: number } = {},
): Promise<ConversationSummary[]> {
  let query = supabase
    .from('email_conversations')
    .select('*')
    .eq('org_id', orgId)
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.status) query = query.eq('status', opts.status)

  const { data, error } = await query
  if (error) throw error

  const conversations = (data as EmailConversation[]) ?? []
  if (conversations.length === 0) return []

  // Resolve candidate names in one batch.
  const candidateIds = Array.from(
    new Set(conversations.map((c) => c.candidate_id).filter((v): v is string => !!v)),
  )
  const nameById = new Map<string, { name: string | null; email: string | null }>()
  if (candidateIds.length > 0) {
    const { data: cands } = await supabase
      .from('candidates')
      .select('id, name, email')
      .eq('org_id', orgId)
      .in('id', candidateIds)
    for (const c of (cands as { id: string; name: string | null; email: string | null }[]) ?? []) {
      nameById.set(c.id, { name: c.name, email: c.email })
    }
  }

  // Latest inbound/outbound reply preview per conversation.
  const convIds = conversations.map((c) => c.id)
  const previewById = new Map<string, { text: string | null; at: string }>()
  const { data: msgs } = await supabase
    .from('email_messages')
    .select('conversation_id, body_text, created_at')
    .eq('org_id', orgId)
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })
  for (const m of (msgs as { conversation_id: string; body_text: string | null; created_at: string }[]) ?? []) {
    if (!previewById.has(m.conversation_id)) {
      previewById.set(m.conversation_id, { text: m.body_text, at: m.created_at })
    }
  }

  return conversations.map((c) => {
    const cand = c.candidate_id ? nameById.get(c.candidate_id) : undefined
    const preview = previewById.get(c.id)
    return {
      ...c,
      candidate_name: cand?.name ?? null,
      candidate_email: cand?.email ?? null,
      last_message_preview: preview?.text ? preview.text.slice(0, 140) : null,
      last_message_at: preview?.at ?? c.last_inbound_at ?? c.last_outbound_at ?? null,
    }
  })
}

export async function getConversationById(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<EmailConversation | null> {
  const { data, error } = await supabase
    .from('email_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as EmailConversation) ?? null
}

export async function findConversationByEnrollment(
  supabase: Supabase,
  orgId: string,
  enrollmentId: string,
): Promise<EmailConversation | null> {
  const { data, error } = await supabase
    .from('email_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('enrollment_id', enrollmentId)
    .maybeSingle()

  if (error) throw error
  return (data as EmailConversation) ?? null
}

// Most recent conversation for a candidate (candidate profile Email tab).
export async function findConversationByCandidate(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<EmailConversation | null> {
  const { data, error } = await supabase
    .from('email_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('candidate_id', candidateId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as EmailConversation) ?? null
}

export async function updateConversation(
  supabase: Supabase,
  orgId: string,
  id: string,
  patch: Partial<{
    status: EmailConversationStatus
    agent_enabled: boolean
    last_inbound_at: string
    last_outbound_at: string
    unread: boolean
    agent_turns: number
    subject: string | null
    context: Record<string, unknown>
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('email_conversations')
    .update(patch as never)
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
}

export async function markRead(supabase: Supabase, orgId: string, id: string): Promise<void> {
  await updateConversation(supabase, orgId, id, { unread: false })
}

// Insert a reply message (inbound or outbound). Swallows the unique-violation
// on provider_message_id so SendGrid Inbound Parse retries are idempotent.
export async function recordMessage(
  supabase: Supabase,
  input: EmailMessageInsert,
): Promise<EmailMessage | null> {
  const { data, error } = await supabase
    .from('email_messages')
    .insert(input as never)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') return null // duplicate provider_message_id
    throw error
  }

  return data as EmailMessage
}

// Build the full chronological thread: automated sequence emails + two-way
// replies, merged and sorted. Reading the union here keeps the hot send path
// (job-handlers) free of any obligation to mirror into email_messages.
export async function getConversationThread(
  supabase: Supabase,
  orgId: string,
  conversation: EmailConversation,
): Promise<ThreadMessage[]> {
  const items: ThreadMessage[] = []

  // Automated outbound sequence emails for this enrollment.
  if (conversation.enrollment_id) {
    const { data: seqEmails, error: seqErr } = await supabase
      .from('sequence_emails')
      .select('id, to_email, subject, body, status, sent_at, created_at')
      .eq('enrollment_id', conversation.enrollment_id)
      .order('created_at', { ascending: true })
    if (seqErr) throw seqErr
    for (const e of (seqEmails as Partial<SequenceEmail>[]) ?? []) {
      items.push({
        id: `seq:${e.id}`,
        direction: 'outbound',
        from_email: null,
        to_email: e.to_email ?? null,
        subject: e.subject ?? null,
        body: e.body ?? null,
        html: e.body ?? null,
        sender: 'sequence',
        status: e.status ?? null,
        created_at: e.sent_at ?? e.created_at ?? new Date(0).toISOString(),
        source: 'sequence',
      })
    }
  }

  // Two-way reply traffic (candidate replies + agent/recruiter answers).
  const { data: replies, error: repErr } = await supabase
    .from('email_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
  if (repErr) throw repErr
  for (const m of (replies as EmailMessage[]) ?? []) {
    items.push({
      id: m.id,
      direction: m.direction,
      from_email: m.from_email,
      to_email: m.to_email,
      subject: m.subject,
      body: m.body_text,
      html: m.body_html,
      sender: m.sender,
      status: m.status,
      created_at: m.created_at,
      source: 'reply',
    })
  }

  items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return items
}

// Resolve a candidate's outbound recipient (name + email), preferring the
// canonical people row over the mirrored candidate columns.
export async function resolveCandidateRecipient(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<{ name: string | null; email: string | null; personId: string | null }> {
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, name, email, person_id')
    .eq('org_id', orgId)
    .eq('id', candidateId)
    .maybeSingle()

  if (!candidate) return { name: null, email: null, personId: null }

  const cand = candidate as { name: string | null; email: string | null; person_id: string | null }
  if (cand.person_id) {
    const { data: person } = await supabase
      .from('people')
      .select('name, email')
      .eq('org_id', orgId)
      .eq('id', cand.person_id)
      .maybeSingle()
    const p = person as { name: string | null; email: string | null } | null
    return {
      name: p?.name ?? cand.name,
      email: p?.email ?? cand.email,
      personId: cand.person_id,
    }
  }

  return { name: cand.name, email: cand.email, personId: null }
}
