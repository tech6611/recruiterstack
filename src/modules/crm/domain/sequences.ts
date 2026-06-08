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
): Promise<SequenceSummary[]> {
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
        .select('sequence_id, status')
        .in('sequence_id', ids)

  const byId = new Map<string, { total: number; replied: number }>()
  for (const e of (enrollments ?? []) as Array<{ sequence_id: string; status: string }>) {
    const entry = byId.get(e.sequence_id) ?? { total: 0, replied: 0 }
    entry.total++
    if (e.status === 'replied') entry.replied++
    byId.set(e.sequence_id, entry)
  }

  return rows.map(r => {
    const stageCount = Array.isArray(r.sequence_stages) ? r.sequence_stages.length : 0
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
      enrollment_count: byId.get(r.id)?.total   ?? 0,
      reply_count:      byId.get(r.id)?.replied ?? 0,
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
): Promise<SequenceAnalytics | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, name')
    .eq('id', sequenceId).eq('org_id', orgId).maybeSingle()
  if (!seq) return null
  const sequence = seq as { id: string; name: string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [enrollmentsRes, stagesRes] = await Promise.all([
    (supabase.from('sequence_enrollments') as any)
      .select('id, status')
      .eq('sequence_id', sequenceId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('sequence_stages') as any)
      .select('id, order_index, subject, delay_days')
      .eq('sequence_id', sequenceId)
      .order('order_index', { ascending: true }),
  ])

  const enrollments = (enrollmentsRes.data ?? []) as Array<{ id: string; status: string }>
  const stages      = (stagesRes.data ?? [])      as Array<{ id: string; order_index: number; subject: string; delay_days: number }>

  const enrollmentIds = enrollments.map(e => e.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emails } = enrollmentIds.length === 0
    ? { data: [] }
    : await (supabase.from('sequence_emails') as any)
        .select('stage_id, status, open_count, click_count')
        .in('enrollment_id', enrollmentIds)

  const enrollmentStatuses: Record<string, number> = {}
  for (const e of enrollments) {
    enrollmentStatuses[e.status] = (enrollmentStatuses[e.status] ?? 0) + 1
  }

  const allEmails = (emails ?? []) as Array<{ stage_id: string; status: string }>
  const overall = {
    total_sent:    allEmails.filter(e => e.status !== 'queued' && e.status !== 'failed').length,
    total_opened:  allEmails.filter(e => ['opened','clicked','replied'].includes(e.status)).length,
    total_replied: allEmails.filter(e => e.status === 'replied').length,
    total_bounced: allEmails.filter(e => e.status === 'bounced').length,
  }

  const stageAnalytics: SequenceStageAnalytics[] = stages.map(s => {
    const stageEmails = allEmails.filter(e => e.stage_id === s.id)
    return {
      stage_id:    s.id,
      order_index: s.order_index,
      subject:     s.subject,
      delay_days:  s.delay_days,
      sent:        stageEmails.filter(e => e.status !== 'queued' && e.status !== 'failed').length,
      delivered:   stageEmails.filter(e => !['queued','failed','bounced'].includes(e.status)).length,
      opened:      stageEmails.filter(e => ['opened','clicked','replied'].includes(e.status)).length,
      clicked:     stageEmails.filter(e => ['clicked','replied'].includes(e.status)).length,
      replied:     stageEmails.filter(e => e.status === 'replied').length,
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
