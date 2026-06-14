import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database, Interview, InterviewInsert } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

/** Facades surface the Postgrest error instead of throwing, because the copilot
 *  tool callers format `Error: ${error.message}` into their LLM-facing strings.
 *  Behaviour must stay byte-identical, so we keep the error in the caller's hands. */
export interface InterviewResult {
  data: Interview | null
  error: PostgrestError | null
}

export interface InterviewListResult {
  data: Interview[] | null
  error: PostgrestError | null
}

/**
 * Insert a scheduled interview row and return it.
 * `body` is the exact insert payload the caller assembled (org_id already set);
 * we force status: 'scheduled' to match the prior inline behaviour.
 */
export async function scheduleInterview(
  supabase: Supabase,
  orgId: string,
  body: Record<string, unknown>,
): Promise<InterviewResult> {
  const { data, error } = await supabase
    .from('interviews')
    .insert({ ...body, org_id: orgId, status: 'scheduled' } as never)
    .select()
    .single()

  return { data: (data as Interview) ?? null, error }
}

export interface ListInterviewsFilters {
  applicationId?: string
  candidateId?: string
  upcomingOnly?: boolean
}

/**
 * List org-scoped interviews with the same optional filters and ordering the
 * copilot getInterviews tool used inline.
 */
export async function listInterviews(
  supabase: Supabase,
  orgId: string,
  filters: ListInterviewsFilters = {},
): Promise<InterviewListResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('interviews')
    .select('*')
    .eq('org_id', orgId)

  if (filters.applicationId) q = q.eq('application_id', filters.applicationId)
  if (filters.candidateId)   q = q.eq('candidate_id', filters.candidateId)
  if (filters.upcomingOnly)  q = q.gte('scheduled_at', new Date().toISOString()).eq('status', 'scheduled')

  const { data, error } = await q.order('scheduled_at', { ascending: true })
  return { data: (data as Interview[]) ?? null, error }
}

/**
 * Update an interview's status/notes (org-scoped by id) and return the row.
 * `notes` of undefined leaves the column untouched, matching the prior inline
 * `notes: notes ?? undefined` semantics.
 */
export async function updateInterviewStatus(
  supabase: Supabase,
  orgId: string,
  interviewId: string,
  status: string,
  notes?: string,
): Promise<InterviewResult> {
  const { data, error } = await supabase
    .from('interviews')
    .update({ status, notes: notes ?? undefined, updated_at: new Date().toISOString() } as never)
    .eq('id', interviewId)
    .eq('org_id', orgId)
    .select()
    .single()

  return { data: (data as Interview) ?? null, error }
}

/**
 * Insert a placeholder self-schedule interview row and return it. The caller
 * computes the token, expiry, and placeholder scheduled_at; we only perform the
 * insert+select.single() that previously lived inline.
 */
export async function createSelfScheduleInterview(
  supabase: Supabase,
  orgId: string,
  row: Omit<InterviewInsert, 'org_id'>,
): Promise<InterviewResult> {
  const { data, error } = await supabase
    .from('interviews')
    .insert({ ...row, org_id: orgId } as never)
    .select()
    .single()

  return { data: (data as Interview) ?? null, error }
}
