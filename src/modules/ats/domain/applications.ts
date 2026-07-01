import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ApplicationEventInsert,
  ApplicationInsert,
  Application,
  Database,
  ScreeningAnswer,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export interface CreateApplicationInput {
  orgId: string
  candidateId: string
  /** Legacy anchor. Optional now (migration 067): a canonical candidacy sets
   *  jobId instead and leaves this unset. Exactly one of hiringRequestId / jobId
   *  should be provided. */
  hiringRequestId?: string | null
  /** Canonical links. jobId set for a candidacy against a canonical job pipeline. */
  jobId?: string | null
  openingId?: string | null
  stageId?: string | null
  status?: Application['status']
  source: Application['source']
  sourceDetail?: string | null
  resumeUrl?: string | null
  coverLetter?: string | null
  creditedTo?: string | null
  /** Screening-question answers (Publish JD Phase 3c). */
  screeningAnswers?: ScreeningAnswer[]
  eeoAnswers?: ScreeningAnswer[]
  knockoutFailed?: boolean
}

export async function createApplication(
  supabase: Supabase,
  input: CreateApplicationInput,
): Promise<Application> {
  const row: ApplicationInsert = {
    org_id: input.orgId,
    candidate_id: input.candidateId,
    // Exactly one anchor: legacy hiring_request OR canonical job. Only reference
    // columns that are set, so neither side is touched when absent.
    ...(input.hiringRequestId ? { hiring_request_id: input.hiringRequestId } : {}),
    ...(input.jobId ? { job_id: input.jobId } : {}),
    ...(input.openingId ? { opening_id: input.openingId } : {}),
    stage_id: input.stageId ?? null,
    status: input.status ?? 'active',
    source: input.source,
    source_detail: input.sourceDetail ?? null,
    resume_url: input.resumeUrl ?? null,
    cover_letter: input.coverLetter ?? null,
    ai_score: null,
    ai_recommendation: null,
    ai_strengths: [],
    ai_gaps: [],
    ai_scored_at: null,
    ai_criterion_scores: null,
    credited_to: input.creditedTo ?? null,
    screening_answers: input.screeningAnswers ?? [],
    eeo_answers: input.eeoAnswers ?? [],
    knockout_failed: input.knockoutFailed ?? false,
  }

  const { data, error } = await supabase
    .from('applications')
    .insert(row as never)
    .select('*')
    .single()

  if (error) throw error
  return data as Application
}

export async function recordApplicationEvent(
  supabase: Supabase,
  input: ApplicationEventInsert,
): Promise<void> {
  const { error } = await supabase
    .from('application_events')
    .insert(input as never)

  if (error) throw error
}

/** Active applications for a set of candidates, with their job title.
 *  Used by the copilot candidate search to annotate each candidate with the
 *  roles they are active in. */
export async function listActiveApplicationsByCandidatesWithJobTitle(
  supabase: Supabase,
  orgId: string,
  candidateIds: string[],
): Promise<Array<{ candidate_id: string; hiring_request: { position_title: string } | null }>> {
  const { data } = await supabase
    .from('applications')
    .select('candidate_id, hiring_request:jobs(position_title:title)')
    .in('candidate_id', candidateIds)
    .eq('org_id', orgId)
    .eq('status', 'active')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

/** Active applications for a legacy job pipeline (hiring_request), with stage,
 *  AI score and candidate name. Returns { data } only — the caller treats a
 *  missing result as an empty list, matching prior behavior. */
export async function listActiveApplicationsForJobPipeline(
  supabase: Supabase,
  orgId: string,
  hiringRequestId: string,
): Promise<Array<{ id: string; stage_id: string | null; ai_score: number | null; candidate: { name: string } | null }>> {
  const { data } = await supabase
    .from('applications')
    .select('id, stage_id, ai_score, candidate:candidates(name)')
    .eq('hiring_request_id', hiringRequestId)
    .eq('org_id', orgId)
    .eq('status', 'active')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

/** hiring_request_id for every active application across the given jobs.
 *  Used to count active candidates per job in the copilot job list. */
export async function listActiveApplicationHiringRequestIds(
  supabase: Supabase,
  orgId: string,
  jobIds: string[],
): Promise<Array<{ hiring_request_id: string }>> {
  const { data } = await supabase
    .from('applications')
    .select('hiring_request_id')
    .in('hiring_request_id', jobIds)
    .eq('org_id', orgId)
    .eq('status', 'active')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

/** All active applications in the org with the fields the copilot stale-check
 *  needs. Returns { data, error } so the caller can preserve its exact error
 *  and empty-state messages. */
export async function listActiveApplicationsForStaleCheck(
  supabase: Supabase,
  orgId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[] | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, applied_at, pipeline_stages(name), hiring_request:jobs(position_title:title), candidate:candidates(name)')
    .eq('org_id', orgId)
    .eq('status', 'active')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** Applications for a single candidate, with stage and job title/status,
 *  newest first. Used by the copilot candidate detail view. */
export async function listApplicationsForCandidateWithJobAndStage(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<Array<{
  id: string
  status: string
  applied_at: string
  ai_score: number | null
  pipeline_stages: { name: string } | null
  hiring_request: { position_title: string; status: string } | null
}>> {
  const { data } = await supabase
    .from('applications')
    .select('id, status, applied_at, ai_score, pipeline_stages(name), hiring_request:jobs(position_title:title, status)')
    .eq('candidate_id', candidateId)
    .eq('org_id', orgId)
    .order('applied_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

/** One application with its current stage, candidate name and job title.
 *  Returns { data, error } to preserve the caller's existence check. */
export async function getApplicationStageContext(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, pipeline_stages(name), candidate:candidates(name), hiring_request:jobs(position_title:title)')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** Set the stage of one application (org-scoped). Returns { error } so the
 *  caller can surface its exact failure message. */
export async function updateApplicationStage(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
  stageId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('applications')
    .update({ stage_id: stageId } as never)
    .eq('id', applicationId)
    .eq('org_id', orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { error: error as any }
}

/** One application with candidate name and job title (org-scoped).
 *  Returns { data, error } to preserve the caller's existence check.
 *  Used by addNoteToApplication. */
export async function getApplicationCandidateAndJob(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name), hiring_request:jobs(position_title:title)')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** candidate_id of existing applications for a job among a candidate set,
 *  used to skip duplicates when adding candidates to a pipeline. */
export async function listExistingApplicationCandidateIds(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  candidateIds: string[],
): Promise<Array<{ candidate_id: string }>> {
  const { data } = await supabase
    .from('applications')
    .select('candidate_id')
    .eq('job_id', jobId)
    .eq('org_id', orgId)
    .in('candidate_id', candidateIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

/** Insert one application into a canonical job pipeline and return its id.
 *  Returns { data, error } so the caller can `continue` on failure exactly
 *  as before. Sets applied_at to now and status to 'active'. */
export async function insertPipelineApplication(
  supabase: Supabase,
  orgId: string,
  input: { candidateId: string; jobId: string; stageId: string | null; source: string },
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      candidate_id:      input.candidateId,
      job_id:            input.jobId,
      stage_id:          input.stageId,
      status:            'active',
      source:            input.source,
      org_id:            orgId,
      applied_at:        new Date().toISOString(),
    } as never)
    .select('id')
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** Active, not-yet-scored applications for a job, each with its full candidate
 *  record. Returns { data, error } so the caller preserves its exact messages. */
export async function listUnscoredActiveApplicationsWithCandidate(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, candidate:candidates(*)')
    .eq('job_id', jobId)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .is('ai_scored_at', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** Persist AI scoring results onto one application by id. Mirrors the prior
 *  inline update which scoped only by id (the rows were already org-filtered
 *  by the preceding fetch). */
export async function applyAiScoreToApplication(
  supabase: Supabase,
  applicationId: string,
  result: { score: number; recommendation: string; strengths: string[]; gaps: string[] },
): Promise<void> {
  await supabase
    .from('applications')
    .update({
      ai_score:          result.score,
      ai_recommendation: result.recommendation,
      ai_strengths:      result.strengths,
      ai_gaps:           result.gaps,
      ai_scored_at:      new Date().toISOString(),
    } as never)
    .eq('id', applicationId)
}

/** One application with candidate name+email and job title (org-scoped).
 *  Used by the copilot outreach-email tool. Returns { data, error }. */
export async function getApplicationCandidateEmailAndJob(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name, email), hiring_request:jobs(position_title:title)')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** One application with candidate_id and job title (org-scoped).
 *  Used by the copilot WhatsApp send tool. Returns { data, error }. */
export async function getApplicationCandidateIdAndJob(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, candidate_id, hiring_request:jobs(position_title:title)')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** Existence check: returns the application's id if it belongs to the org,
 *  else null. Used inside the copilot bulk status-update loop. */
export async function findApplicationIdInOrg(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('applications')
    .select('id')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? null) as any
}

/** Set the status of one application (org-scoped). Used by the copilot bulk
 *  status-update tool. */
export async function updateApplicationStatusInOrg(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
  status: string,
): Promise<void> {
  await supabase
    .from('applications')
    .update({ status } as never)
    .eq('id', applicationId)
    .eq('org_id', orgId)
}

/** One application's current stage name (org-scoped), or null if not found.
 *  Used inside the copilot bulk move-to-stage loop. */
export async function getApplicationStageNameInOrg(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{ id: string; pipeline_stages: { name: string } | null } | null> {
  const { data } = await supabase
    .from('applications')
    .select('id, pipeline_stages(name)')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? null) as any
}

/** Set the stage of one application by id only (no org filter), mirroring the
 *  prior inline update inside the bulk move loop where the row was already
 *  org-verified by the preceding fetch. */
export async function updateApplicationStageById(
  supabase: Supabase,
  applicationId: string,
  stageId: string,
): Promise<void> {
  await supabase
    .from('applications')
    .update({ stage_id: stageId } as never)
    .eq('id', applicationId)
}

/** Active applications for a job with a non-null AI score strictly below the
 *  threshold, each with candidate name. Returns { data, error } so the caller
 *  keeps its exact error and empty messages. */
export async function listActiveApplicationsBelowScore(
  supabase: Supabase,
  orgId: string,
  hiringRequestId: string,
  belowScore: number,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, ai_score, candidate:candidates(name)')
    .eq('hiring_request_id', hiringRequestId)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .not('ai_score', 'is', null)
    .lt('ai_score', belowScore)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** Set the status of one application by id only (no org filter), mirroring the
 *  prior inline update inside the bulk-reject loop where rows were already
 *  org-verified by the preceding fetch. */
export async function updateApplicationStatusById(
  supabase: Supabase,
  applicationId: string,
  status: string,
): Promise<void> {
  await supabase
    .from('applications')
    .update({ status } as never)
    .eq('id', applicationId)
}

/** Active applications applied before the given cutoff, with candidate
 *  full_name, job title and stage name; oldest first, capped at 20.
 *  Used by the copilot inbox "needs attention" panel. */
export async function listStaleActiveApplicationsForInbox(
  supabase: Supabase,
  orgId: string,
  cutoffIso: string,
): Promise<Array<{
  id: string
  status: string
  applied_at: string
  stage_id: string | null
  candidate: { full_name: string } | null
  job: { position_title: string } | null
  stage: { name: string } | null
}>> {
  const { data } = await supabase
    .from('applications')
    .select(`
        id, status, applied_at, stage_id,
        candidate:candidates(full_name),
        job:jobs(position_title:title),
        stage:pipeline_stages(name)
      `)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .lt('applied_at', cutoffIso)
    .order('applied_at', { ascending: true })
    .limit(20)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

/** One application with candidate full_name and job title (org-scoped),
 *  using the `job:` alias. Used by createScorecard. Returns { data, error }. */
export async function getApplicationCandidateFullNameAndJob(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, candidate:candidates(full_name), job:jobs(position_title:title)')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** One application with status, candidate full_name+email, job
 *  title+department and stage name (org-scoped). Used by the copilot
 *  email-draft tool. Returns { data, error }. */
export async function getApplicationForEmailDraft(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any | null
  error: { message: string } | null
}> {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      id, status,
      candidate:candidates(full_name, email),
      job:jobs(position_title:title, department:departments(name)),
      stage:pipeline_stages(name)
    `)
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any, error: error as any }
}

/** Applications for a candidate (org-scoped) with the fields the AI candidate
 *  summary needs: status/source/applied_at/AI fields plus stage name and job
 *  title/department/level. Newest first. */
export async function listApplicationsForCandidateSummary(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[] | null
}> {
  const { data } = await supabase
    .from('applications')
    .select(`
        id, status, source, applied_at, ai_score, ai_recommendation,
        ai_strengths, ai_gaps,
        pipeline_stages(name),
        hiring_requests(position_title, department, level)
      `)
    .eq('candidate_id', candidateId)
    .eq('org_id', orgId)
    .order('applied_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data ?? null) as any }
}

