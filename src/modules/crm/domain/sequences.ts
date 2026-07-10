import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// Read shapes — match the legacy API responses exactly so the route refactor is
// purely mechanical. Write paths still live in the routes for v1 (the
// enrollment scheduling flow is delicate; extracting later won't break callers).

export interface SequenceSummary {
  id:               string
  org_id:           string
  name:             string
  description:      string | null
  status:           string
  created_by:       string | null
  created_at:       string
  updated_at:       string
  stage_count:      number
  enrollment_count: number
  sent_count:       number
  open_count:       number
  click_count:      number
  reply_count:      number
}

export interface SequenceStage {
  id:                   string
  org_id:               string
  sequence_id:          string
  order_index:          number
  delay_days:           number
  subject:              string
  body:                 string
  send_on_behalf_of:    string | null
  send_on_behalf_email: string | null
  created_at:           string
  updated_at:           string
  // Extended columns from migrations 027 + 031 (nullable).
  channel?:             string | null
  send_at_time?:        string | null
  send_timezone?:       string | null
  delay_business_days?: boolean | null
  condition?:           string | null
  delay_minutes?:       number | null
  send_at?:             string | null
}

export interface SequenceDetail {
  id:               string
  org_id:           string
  name:             string
  description:      string | null
  status:           string
  created_by:       string | null
  created_at:       string
  updated_at:       string
  stages:           SequenceStage[]
  enrollment_count: number
  reply_count:      number
}

export interface EnrollmentRow {
  id:                  string
  org_id:              string
  sequence_id:         string
  candidate_id:        string
  application_id:      string | null
  enrolled_by:         string | null
  status:              string
  current_stage_index: number
  next_send_at:        string | null
  started_at:          string
  completed_at:        string | null
  created_at:          string
  candidate_name:      string
  candidate_email:     string | null
}

export interface SequenceStageAnalytics {
  stage_id:    string
  order_index: number
  subject:     string
  delay_days:  number
  sent:        number
  delivered:   number
  opened:      number
  clicked:     number
  replied:     number
  bounced:     number
}

export interface SequenceAnalytics {
  sequence_id:         string
  sequence_name:       string
  total_enrollments:   number
  enrollment_statuses: Record<string, number>
  overall: {
    total_sent:    number
    total_opened:  number
    total_replied: number
    total_bounced: number
  }
  stages: SequenceStageAnalytics[]
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listSequences(
  supabase: Supabase,
  orgId: string,
  since: Date | null = null,
): Promise<SequenceSummary[]> {
  // When `since` is set, the funnel counts (enrolled/sent/opened/clicked/replied)
  // are scoped to activity within the window — same rule as the CSV export so the
  // on-screen numbers and the download agree. `since = null` = all-time.
  const sinceIso = since ? since.toISOString() : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sequences, error } = await (supabase.from('sequences') as any)
    .select('*, sequence_stages(id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (sequences ?? []) as Array<{ id: string; sequence_stages?: unknown[] } & Record<string, unknown>>
  const ids  = rows.map(r => r.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollments } = ids.length === 0
    ? { data: [] }
    : await (supabase.from('sequence_enrollments') as any)
        .select('id, sequence_id, status, started_at')
        .in('sequence_id', ids)

  const enrollmentRows = (enrollments ?? []) as Array<{ id: string; sequence_id: string; status: string; started_at: string | null }>

  const byId = new Map<string, { total: number; replied: number; sent: number; opened: number; clicked: number }>()
  // enrollment_id → sequence_id, so we can attribute each email row (which only
  // links to an enrollment, not directly to a sequence) back to its sequence.
  const seqOfEnrollment = new Map<string, string>()
  for (const e of enrollmentRows) {
    seqOfEnrollment.set(e.id, e.sequence_id)
    const entry = byId.get(e.sequence_id) ?? { total: 0, replied: 0, sent: 0, opened: 0, clicked: 0 }
    // Enrolled + replied are scoped by when the candidate was enrolled.
    if (!sinceIso || (e.started_at ?? '') >= sinceIso) {
      entry.total++
      if (e.status === 'replied') entry.replied++
    }
    byId.set(e.sequence_id, entry)
  }

  // Roll up the email funnel (sent / opened / clicked) per sequence. Same status
  // definitions as the per-sequence Analytics tab so the numbers agree: opened
  // includes clicked+replied, clicked includes replied. Statuses before a real
  // send (queued/failed/skipped) don't count as sent.
  const enrollmentIds = enrollmentRows.map(e => e.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emails } = enrollmentIds.length === 0
    ? { data: [] }
    : await (supabase.from('sequence_emails') as any)
        .select('enrollment_id, status, sent_at')
        .in('enrollment_id', enrollmentIds)

  const NOT_SENT = ['queued', 'failed', 'skipped']
  for (const em of (emails ?? []) as Array<{ enrollment_id: string; status: string; sent_at: string | null }>) {
    if (sinceIso && (em.sent_at ?? '') < sinceIso) continue
    const seqId = seqOfEnrollment.get(em.enrollment_id)
    if (!seqId) continue
    const entry = byId.get(seqId)
    if (!entry) continue
    if (!NOT_SENT.includes(em.status)) entry.sent++
    if (['opened', 'clicked', 'replied'].includes(em.status)) entry.opened++
    if (['clicked', 'replied'].includes(em.status)) entry.clicked++
  }

  return rows.map(r => {
    const stageCount = Array.isArray(r.sequence_stages) ? r.sequence_stages.length : 0
    const agg = byId.get(r.id)
    return {
      id:               r.id,
      org_id:           r.org_id as string,
      name:             r.name as string,
      description:      (r.description as string | null) ?? null,
      status:           r.status as string,
      created_by:       (r.created_by as string | null) ?? null,
      created_at:       r.created_at as string,
      updated_at:       r.updated_at as string,
      stage_count:      stageCount,
      enrollment_count: agg?.total   ?? 0,
      sent_count:       agg?.sent    ?? 0,
      open_count:       agg?.opened  ?? 0,
      click_count:      agg?.clicked ?? 0,
      reply_count:      agg?.replied ?? 0,
    }
  })
}

// One row per sequence for the CSV export. Funnel counts are scoped to activity
// *within a window* (option B): if `since` is set, only enrollments started on/
// after it and only emails sent on/after it are counted. `since = null` = all-time.
export interface SequenceExportRow {
  name:             string
  status:           string
  stage_count:      number
  enrollment_count: number
  sent_count:       number
  open_count:       number
  click_count:      number
  reply_count:      number
  reply_rate:       number   // replied ÷ enrolled, whole-number %
  created_at:       string
}

export async function listSequencesForExport(
  supabase: Supabase,
  orgId: string,
  since: Date | null,
): Promise<SequenceExportRow[]> {
  const sinceIso = since ? since.toISOString() : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sequences, error } = await (supabase.from('sequences') as any)
    .select('*, sequence_stages(id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (sequences ?? []) as Array<{ id: string; sequence_stages?: unknown[] } & Record<string, unknown>>
  const ids  = rows.map(r => r.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollments } = ids.length === 0
    ? { data: [] }
    : await (supabase.from('sequence_enrollments') as any)
        .select('id, sequence_id, status, started_at')
        .in('sequence_id', ids)

  const enrollmentRows = (enrollments ?? []) as Array<{ id: string; sequence_id: string; status: string; started_at: string | null }>

  // enrollment_id → sequence_id, so windowed email rows can be attributed back
  // to their sequence (emails only link to an enrollment, not a sequence).
  const seqOfEnrollment = new Map<string, string>()
  const byId = new Map<string, { enrolled: number; sent: number; opened: number; clicked: number; replied: number }>()
  for (const e of enrollmentRows) {
    seqOfEnrollment.set(e.id, e.sequence_id)
    const entry = byId.get(e.sequence_id) ?? { enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0 }
    // Enrolled is scoped by when the candidate was enrolled.
    if (!sinceIso || (e.started_at ?? '') >= sinceIso) entry.enrolled++
    byId.set(e.sequence_id, entry)
  }

  const enrollmentIds = enrollmentRows.map(e => e.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emails } = enrollmentIds.length === 0
    ? { data: [] }
    : await (supabase.from('sequence_emails') as any)
        .select('enrollment_id, status, sent_at')
        .in('enrollment_id', enrollmentIds)

  // Same status definitions as the on-screen row funnel: opened includes
  // clicked+replied, clicked includes replied, and pre-send statuses don't count
  // as sent. Each email is scoped by its send time.
  const NOT_SENT = ['queued', 'failed', 'skipped']
  for (const em of (emails ?? []) as Array<{ enrollment_id: string; status: string; sent_at: string | null }>) {
    if (sinceIso && (em.sent_at ?? '') < sinceIso) continue
    const seqId = seqOfEnrollment.get(em.enrollment_id)
    if (!seqId) continue
    const entry = byId.get(seqId)
    if (!entry) continue
    if (!NOT_SENT.includes(em.status)) entry.sent++
    if (['opened', 'clicked', 'replied'].includes(em.status)) entry.opened++
    if (['clicked', 'replied'].includes(em.status)) entry.clicked++
    if (em.status === 'replied') entry.replied++
  }

  return rows.map(r => {
    const stageCount = Array.isArray(r.sequence_stages) ? r.sequence_stages.length : 0
    const agg = byId.get(r.id) ?? { enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0 }
    const replyRate = agg.enrolled > 0 ? Math.round((agg.replied / agg.enrolled) * 100) : 0
    return {
      name:             r.name as string,
      status:           r.status as string,
      stage_count:      stageCount,
      enrollment_count: agg.enrolled,
      sent_count:       agg.sent,
      open_count:       agg.opened,
      click_count:      agg.clicked,
      reply_count:      agg.replied,
      reply_rate:       replyRate,
      created_at:       r.created_at as string,
    }
  })
}

export async function getSequence(
  supabase: Supabase,
  orgId: string,
  sequenceId: string,
): Promise<SequenceDetail | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequences') as any)
    .select('*, sequence_stages(*)')
    .eq('id', sequenceId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as Record<string, unknown> & { sequence_stages?: unknown[] }
  const stages = (Array.isArray(row.sequence_stages) ? row.sequence_stages : [])
    .map(s => s as SequenceStage)
    .sort((a, b) => a.order_index - b.order_index)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ count: enrollmentCount }, { count: replyCount }] = await Promise.all([
    (supabase.from('sequence_enrollments') as any)
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', sequenceId)
      .eq('org_id', orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('sequence_enrollments') as any)
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', sequenceId)
      .eq('org_id', orgId)
      .eq('status', 'replied'),
  ])

  return {
    id:               row.id as string,
    org_id:           row.org_id as string,
    name:             row.name as string,
    description:      (row.description as string | null) ?? null,
    status:           row.status as string,
    created_by:       (row.created_by as string | null) ?? null,
    created_at:       row.created_at as string,
    updated_at:       row.updated_at as string,
    stages,
    enrollment_count: enrollmentCount ?? 0,
    reply_count:      replyCount ?? 0,
  }
}

export async function listEnrollments(
  supabase: Supabase,
  orgId: string,
  sequenceId: string,
): Promise<EnrollmentRow[]> {
  // Cheap existence check so we return a clear shape when the sequence is wrong-org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id')
    .eq('id', sequenceId).eq('org_id', orgId).maybeSingle()
  if (!seq) throw new Error('Sequence not found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequence_enrollments') as any)
    .select('*, candidates(name, email)')
    .eq('sequence_id', sequenceId)
    .order('created_at', { ascending: false })
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((e: any) => ({
    ...e,
    candidate_name:  e.candidates?.name ?? 'Unknown',
    candidate_email: e.candidates?.email ?? null,
    candidates:      undefined,
  })) as EnrollmentRow[]
}

export async function getSequenceAnalytics(
  supabase: Supabase,
  orgId: string,
  sequenceId: string,
  since: Date | null = null,
): Promise<SequenceAnalytics | null> {
  // When `since` is set, enrollments are scoped by started_at and emails by
  // sent_at, so every number reflects activity within the window. `since = null`
  // = all-time (the historical default).
  const sinceIso = since ? since.toISOString() : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, name')
    .eq('id', sequenceId).eq('org_id', orgId).maybeSingle()
  if (!seq) return null
  const sequence = seq as { id: string; name: string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [enrollmentsRes, stagesRes] = await Promise.all([
    (supabase.from('sequence_enrollments') as any)
      .select('id, status, started_at')
      .eq('sequence_id', sequenceId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('sequence_stages') as any)
      .select('id, order_index, subject, delay_days')
      .eq('sequence_id', sequenceId)
      .order('order_index', { ascending: true }),
  ])

  const allEnrollments = (enrollmentsRes.data ?? []) as Array<{ id: string; status: string; started_at: string | null }>
  // Enrollment-based metrics (statuses, replies) are scoped by enrollment date.
  const enrollments = sinceIso
    ? allEnrollments.filter(e => (e.started_at ?? '') >= sinceIso)
    : allEnrollments
  const stages      = (stagesRes.data ?? [])      as Array<{ id: string; order_index: number; subject: string; delay_days: number }>

  // Email funnel is scoped by sent_at (not by the enrollment window) so an email
  // sent inside the window still counts even if the candidate enrolled earlier —
  // matching the on-screen list and CSV export.
  const allEnrollmentIds = allEnrollments.map(e => e.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emailsRaw } = allEnrollmentIds.length === 0
    ? { data: [] }
    : await (supabase.from('sequence_emails') as any)
        .select('enrollment_id, stage_id, status, open_count, click_count, sent_at')
        .in('enrollment_id', allEnrollmentIds)
  const emails = ((emailsRaw ?? []) as Array<{ enrollment_id: string; stage_id: string; status: string; sent_at: string | null }>)
    .filter(em => !sinceIso || (em.sent_at ?? '') >= sinceIso)

  const enrollmentStatuses: Record<string, number> = {}
  for (const e of enrollments) {
    enrollmentStatuses[e.status] = (enrollmentStatuses[e.status] ?? 0) + 1
  }

  // 'skipped' rows are stages a send condition held back — they never went out,
  // so they don't count as sent/delivered.
  const NOT_SENT = ['queued', 'failed', 'skipped']
  const allEmails = (emails ?? []) as Array<{ enrollment_id: string; stage_id: string; status: string; sent_at: string | null }>

  // Replies are recorded on the ENROLLMENT (by the inbound-reply webhook), not on
  // the individual email row. Attribute each replied enrollment to the last stage
  // we actually sent it — that's the message they were replying to — so both the
  // overall count and per-stage reply rates reflect reality.
  const repliedEnrollmentIds = new Set(enrollments.filter(e => e.status === 'replied').map(e => e.id))
  const repliedByStage = new Map<string, number>()
  const lastSentByEnrollment = new Map<string, { stageId: string; sentAt: string }>()
  for (const em of allEmails) {
    if (!repliedEnrollmentIds.has(em.enrollment_id) || NOT_SENT.includes(em.status)) continue
    const prev = lastSentByEnrollment.get(em.enrollment_id)
    if (!prev || (em.sent_at ?? '') > prev.sentAt) {
      lastSentByEnrollment.set(em.enrollment_id, { stageId: em.stage_id, sentAt: em.sent_at ?? '' })
    }
  }
  for (const { stageId } of Array.from(lastSentByEnrollment.values())) {
    repliedByStage.set(stageId, (repliedByStage.get(stageId) ?? 0) + 1)
  }

  const overall = {
    total_sent:    allEmails.filter(e => !NOT_SENT.includes(e.status)).length,
    total_opened:  allEmails.filter(e => ['opened','clicked','replied'].includes(e.status)).length,
    total_replied: repliedEnrollmentIds.size,
    total_bounced: allEmails.filter(e => e.status === 'bounced').length,
  }

  const stageAnalytics: SequenceStageAnalytics[] = stages.map(s => {
    const stageEmails = allEmails.filter(e => e.stage_id === s.id)
    return {
      stage_id:    s.id,
      order_index: s.order_index,
      subject:     s.subject,
      delay_days:  s.delay_days,
      sent:        stageEmails.filter(e => !NOT_SENT.includes(e.status)).length,
      delivered:   stageEmails.filter(e => !['queued','failed','skipped','bounced'].includes(e.status)).length,
      opened:      stageEmails.filter(e => ['opened','clicked','replied'].includes(e.status)).length,
      clicked:     stageEmails.filter(e => ['clicked','replied'].includes(e.status)).length,
      replied:     repliedByStage.get(s.id) ?? 0,
      bounced:     stageEmails.filter(e => e.status === 'bounced').length,
    }
  })

  return {
    sequence_id:         sequence.id,
    sequence_name:       sequence.name,
    total_enrollments:   enrollments.length,
    enrollment_statuses: enrollmentStatuses,
    overall,
    stages:              stageAnalytics,
  }
}

// Cross-module helper for the CRM sub-agent: every active enrollment a candidate
// is in. Lets the agent answer "is this candidate still in our outreach?".
export interface CandidateEnrollment {
  enrollment_id:       string
  sequence_id:         string
  sequence_name:       string
  status:              string
  current_stage_index: number
  next_send_at:        string | null
  started_at:          string
}

export async function listCandidateEnrollments(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<CandidateEnrollment[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequence_enrollments') as any)
    .select('id, sequence_id, status, current_stage_index, next_send_at, started_at, sequences(name)')
    .eq('org_id', orgId)
    .eq('candidate_id', candidateId)
    .order('started_at', { ascending: false })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((e: any) => ({
    enrollment_id:       e.id,
    sequence_id:         e.sequence_id,
    sequence_name:       e.sequences?.name ?? 'Unknown sequence',
    status:              e.status,
    current_stage_index: e.current_stage_index,
    next_send_at:        e.next_send_at ?? null,
    started_at:          e.started_at,
  }))
}
