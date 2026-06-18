import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Application,
  Candidate,
  Database,
  HiringRequest,
  HiringRequestUpdate,
  PipelineStage,
  StageColor,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export type CanonicalJobPipelineSource = 'requisition_job' | 'legacy_hiring_request'

export interface CanonicalJobPipeline {
  id: string
  orgId: string
  title: string
  status: string
  source: CanonicalJobPipelineSource
  departmentName: string | null
  createdAt: string | null
}

export interface LegacyJobPipelineSummary extends HiringRequest {
  total_candidates: number
  stage_counts: {
    stage_id: string
    stage_name: string
    color: StageColor
    count: number
  }[]
}

export interface LegacyJobPipelineDetail extends HiringRequest {
  pipeline_stages: PipelineStage[]
  applications: (Application & { candidate: Candidate })[]
}

export interface LegacyJobScoringContext {
  job: HiringRequest
  stages: PipelineStage[]
  applications: (Application & { candidate: Candidate })[]
}

export interface LegacyCandidateJobContext {
  candidate: {
    name: string
    email: string
    current_title?: string | null
    location?: string | null
  }
  job: {
    position_title: string
    ticket_number?: string | null
  }
}

export interface LegacyApplyJob {
  id: string
  org_id: string
  position_title: string
  status: string
  auto_advance_score: number | null
  auto_reject_score: number | null
}

export interface LegacyApplyJobPreview {
  position_title: string
  department: string | null
  location: string | null
  generated_jd: string | null
  status: string
}

export async function listCanonicalJobPipelines(
  supabase: Supabase,
  orgId: string,
): Promise<CanonicalJobPipeline[]> {
  const [jobsRes, legacyRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, org_id, title, status, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('hiring_requests')
      .select('id, org_id, position_title, status, department, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (legacyRes.error) throw legacyRes.error

  const canonical = ((jobsRes.data ?? []) as Array<{
    id: string
    org_id: string
    title: string
    status: string
    created_at: string | null
  }>).map(job => ({
    id: job.id,
    orgId: job.org_id,
    title: job.title,
    status: job.status,
    source: 'requisition_job' as const,
    departmentName: null,
    createdAt: job.created_at,
  }))

  const legacy = ((legacyRes.data ?? []) as Array<{
    id: string
    org_id: string
    position_title: string
    status: string
    department: string | null
    created_at: string | null
  }>).map(job => ({
    id: job.id,
    orgId: job.org_id,
    title: job.position_title,
    status: job.status,
    source: 'legacy_hiring_request' as const,
    departmentName: job.department,
    createdAt: job.created_at,
  }))

  return [...canonical, ...legacy].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )
}

export async function getCanonicalJobPipeline(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<CanonicalJobPipeline | null> {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, org_id, title, status, created_at')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (jobError) throw jobError
  if (job) {
    const row = job as {
      id: string
      org_id: string
      title: string
      status: string
      created_at: string | null
    }
    return {
      id: row.id,
      orgId: row.org_id,
      title: row.title,
      status: row.status,
      source: 'requisition_job',
      departmentName: null,
      createdAt: row.created_at,
    }
  }

  const { data: legacy, error: legacyError } = await supabase
    .from('hiring_requests')
    .select('id, org_id, position_title, status, department, created_at')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (legacyError) throw legacyError
  if (!legacy) return null

  const row = legacy as {
    id: string
    org_id: string
    position_title: string
    status: string
    department: string | null
    created_at: string | null
  }
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.position_title,
    status: row.status,
    source: 'legacy_hiring_request',
    departmentName: row.department,
    createdAt: row.created_at,
  }
}

export async function listLegacyJobPipelineSummaries(
  supabase: Supabase,
  orgId: string,
): Promise<LegacyJobPipelineSummary[]> {
  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('id, hiring_request_id, name, color, order_index')
      .eq('org_id', orgId),
    supabase
      .from('applications')
      .select('id, hiring_request_id, stage_id, status')
      .eq('org_id', orgId),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error

  const stages = (stagesRes.data ?? []) as Pick<PipelineStage, 'id' | 'hiring_request_id' | 'name' | 'color' | 'order_index'>[]
  const apps = (appsRes.data ?? []) as Pick<Application, 'id' | 'hiring_request_id' | 'stage_id' | 'status'>[]

  return ((jobsRes.data ?? []) as HiringRequest[]).map(job => {
    const jobStages = stages
      .filter(s => s.hiring_request_id === job.id)
      .sort((a, b) => a.order_index - b.order_index)
    const jobApps = apps.filter(a => a.hiring_request_id === job.id)
    const activeApps = jobApps.filter(a => a.status === 'active')

    return {
      ...job,
      total_candidates: jobApps.length,
      stage_counts: jobStages.map(s => ({
        stage_id: s.id,
        stage_name: s.name,
        color: s.color,
        count: activeApps.filter(a => a.stage_id === s.id).length,
      })),
    }
  })
}

export async function getLegacyJobPipelineDetail(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<LegacyJobPipelineDetail | null> {
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('*, ai_score, ai_recommendation, ai_strengths, ai_gaps, ai_criterion_scores, ai_scored_at, candidate:candidates(*)')
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .order('applied_at', { ascending: true }),
  ])

  if (jobRes.error) throw jobRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (!jobRes.data) return null

  return {
    ...(jobRes.data as HiringRequest),
    pipeline_stages: (stagesRes.data ?? []) as PipelineStage[],
    applications: (appsRes.data ?? []) as unknown as (Application & { candidate: Candidate })[],
  }
}

export async function getLegacyJobScoringContext(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<LegacyJobScoringContext | null> {
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('*, candidate:candidates(*)')
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])

  if (jobRes.error) throw jobRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (!jobRes.data) return null

  return {
    job: jobRes.data as HiringRequest,
    stages: (stagesRes.data ?? []) as PipelineStage[],
    applications: (appsRes.data ?? []) as unknown as (Application & { candidate: Candidate })[],
  }
}

export async function getLegacyCandidateJobContext(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  hiringRequestId: string,
): Promise<LegacyCandidateJobContext | null> {
  const [candidateRes, jobRes] = await Promise.all([
    supabase
      .from('candidates')
      .select('name, email, current_title, location')
      .eq('id', candidateId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('hiring_requests')
      .select('position_title, ticket_number')
      .eq('id', hiringRequestId)
      .eq('org_id', orgId)
      .maybeSingle(),
  ])

  if (candidateRes.error) throw candidateRes.error
  if (jobRes.error) throw jobRes.error
  if (!candidateRes.data || !jobRes.data) return null

  return {
    candidate: candidateRes.data as LegacyCandidateJobContext['candidate'],
    job: jobRes.data as LegacyCandidateJobContext['job'],
  }
}

export async function getLegacyApplyJobPreview(
  supabase: Supabase,
  token: string,
): Promise<LegacyApplyJobPreview | null> {
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('position_title, department, location, generated_jd, status')
    .eq('apply_link_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  return data as LegacyApplyJobPreview | null
}

export async function getLegacyApplyJobByToken(
  supabase: Supabase,
  token: string,
): Promise<LegacyApplyJob | null> {
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('id, org_id, position_title, status, auto_advance_score, auto_reject_score')
    .eq('apply_link_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  return data as LegacyApplyJob | null
}

export async function activateLegacyApplyJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<void> {
  const { error } = await supabase
    .from('hiring_requests')
    .update({ status: 'active' } as never)
    .eq('id', jobId)
    .eq('org_id', orgId)

  if (error) throw error
}

export async function getFirstLegacyPipelineStage(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Pick<PipelineStage, 'id' | 'name'> | null> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('hiring_request_id', jobId)
    .eq('org_id', orgId)
    .order('order_index')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as Pick<PipelineStage, 'id' | 'name'> | null
}

// ── Agent-facing legacy helpers (Slice 2a) ───────────────────────────────────
// Single home for the copilot agent's legacy `hiring_requests` access, so no
// agent tool touches that table directly. Net-new job/intake creation still
// lands in `hiring_requests` as a compatibility-justified write (legacy is
// frozen, not yet migrated to canonical `jobs`); redirect these to the
// canonical pipeline when that migration happens.

export interface LegacyAgentJob {
  id: string
  position_title: string
  status: string
  hiring_manager_name: string | null
  department: string | null
}

export interface LegacyAgentJobListRow extends LegacyAgentJob {
  created_at: string | null
}

// Lookup for get_job_pipeline: by id, or fuzzy by title for disambiguation.
export async function findLegacyJobsForAgent(
  supabase: Supabase,
  orgId: string,
  opts: { jobId?: string; titleQuery?: string; limit?: number },
): Promise<LegacyAgentJob[]> {
  let q = supabase
    .from('hiring_requests')
    .select('id, position_title, status, hiring_manager_name, department')
    .eq('org_id', orgId)

  if (opts.jobId) q = q.eq('id', opts.jobId)
  else if (opts.titleQuery) q = q.ilike('position_title', `%${opts.titleQuery}%`)

  const { data, error } = await q.limit(opts.limit ?? 5)
  if (error) throw error
  return (data ?? []) as LegacyAgentJob[]
}

// List for list_jobs, newest first, optional status filter.
export async function listLegacyJobsForAgent(
  supabase: Supabase,
  orgId: string,
  statusFilter?: string,
): Promise<LegacyAgentJobListRow[]> {
  let q = supabase
    .from('hiring_requests')
    .select('id, position_title, status, hiring_manager_name, department, created_at')
    .eq('org_id', orgId)

  if (statusFilter) q = q.eq('status', statusFilter as never)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LegacyAgentJobListRow[]
}

// Total legacy job count for get_dashboard_stats.
export async function countLegacyJobs(supabase: Supabase, orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from('hiring_requests')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (error) throw error
  return count ?? 0
}

// Full legacy job row for bulk_score_applications (scoring context) and update_job.
export async function getLegacyJobById(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<HiringRequest | null> {
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('*')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  return (data as HiringRequest) ?? null
}

/** Token-population fields for a legacy job, by hiring_request_id. Used by the
 *  sequence-email handler. Matches the original inline read: looked up by id
 *  only (no org filter in scope there), missing/error → null. */
export async function getLegacyJobTokens(
  supabase: Supabase,
  hiringRequestId: string,
): Promise<Pick<HiringRequest, 'position_title' | 'autopilot_company_name' | 'autopilot_recruiter_name'> | null> {
  const { data } = await supabase
    .from('hiring_requests')
    .select('position_title, autopilot_company_name, autopilot_recruiter_name')
    .eq('id', hiringRequestId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any) ?? null
}

// Partial update for update_job.
export async function updateLegacyJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  updates: HiringRequestUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('hiring_requests')
    .update(updates as never)
    .eq('id', jobId)
    .eq('org_id', orgId)

  if (error) throw error
}

export interface CreateLegacyJobInput {
  positionTitle: string
  hiringManagerName: string
  location?: string | null
  headcount?: number
  department?: string | null
  level?: string | null
  keyRequirements?: string | null
  niceToHaves?: string | null
  remoteOk?: boolean
}

// Net-new job creation for create_job_and_pipeline (compatibility write).
export async function createLegacyJobAndPipeline(
  supabase: Supabase,
  orgId: string,
  input: CreateLegacyJobInput,
): Promise<{ id: string; position_title: string; ticket_number: string | null }> {
  const { data, error } = await supabase
    .from('hiring_requests')
    .insert({
      position_title:       input.positionTitle,
      hiring_manager_name:  input.hiringManagerName,
      location:             input.location ?? null,
      headcount:            input.headcount ?? 1,
      department:           input.department ?? null,
      level:                input.level ?? null,
      key_requirements:     input.keyRequirements ?? null,
      nice_to_haves:        input.niceToHaves ?? null,
      remote_ok:            input.remoteOk ?? false,
      filled_by_recruiter:  true,
      status:               'jd_approved',
      intake_token:         crypto.randomUUID(),
      apply_link_token:     crypto.randomUUID(),
      intake_submitted_at:  new Date().toISOString(),
      auto_email_rejection: false,
      org_id:               orgId,
    } as never)
    .select('id, position_title, ticket_number')
    .single()

  if (error) throw error
  return data as { id: string; position_title: string; ticket_number: string | null }
}

export interface CreateLegacyIntakeInput {
  positionTitle: string
  hiringManagerName: string
  hiringManagerEmail: string
  hiringManagerSlack?: string | null
  department?: string | null
}

// Net-new intake creation for create_intake_request (compatibility write).
export async function createLegacyIntakeRequest(
  supabase: Supabase,
  orgId: string,
  input: CreateLegacyIntakeInput,
): Promise<{ id: string; intake_token: string; position_title: string }> {
  const { data, error } = await supabase
    .from('hiring_requests')
    .insert({
      position_title:       input.positionTitle,
      hiring_manager_name:  input.hiringManagerName,
      hiring_manager_email: input.hiringManagerEmail,
      hiring_manager_slack: input.hiringManagerSlack ?? null,
      department:           input.department ?? null,
      status:               'intake_pending',
      filled_by_recruiter:  false,
      intake_sent_at:       new Date().toISOString(),
      org_id:               orgId,
    } as never)
    .select('id, intake_token, position_title')
    .single()

  if (error) throw error
  return data as { id: string; intake_token: string; position_title: string }
}

// ── Pipeline-stage write/read facade (Slice 2) ───────────────────────────────

// Ordered stages for one legacy job (get_job_pipeline agent tool).
// Org-scoped; sorted by order_index. Caller does all string formatting.
export async function listLegacyPipelineStagesForJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Pick<PipelineStage, 'id' | 'name' | 'order_index'>[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name, order_index')
    .eq('hiring_request_id', jobId)
    .eq('org_id', orgId)
    .order('order_index')

  if (error) throw error
  return (data ?? []) as Pick<PipelineStage, 'id' | 'name' | 'order_index'>[]
}

// ── Canonical job stages (migration 066) — keyed on jobs.id via pipeline_stages.job_id ──

/** Ordered stages for a canonical job (Phase 3 / C1). */
export async function listJobStages(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Pick<PipelineStage, 'id' | 'name' | 'order_index'>[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name, order_index')
    .eq('job_id', jobId)
    .eq('org_id', orgId)
    .order('order_index')

  if (error) throw error
  return (data ?? []) as Pick<PipelineStage, 'id' | 'name' | 'order_index'>[]
}

/** First stage ('Applied') of a canonical job — the entry stage for new applications. */
export async function getFirstJobStage(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Pick<PipelineStage, 'id' | 'name'> | null> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('job_id', jobId)
    .eq('org_id', orgId)
    .order('order_index')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as Pick<PipelineStage, 'id' | 'name'> | null
}

// Lookup a single pipeline stage by id within the org (move_application_to_stage
// + bulk_move_to_stage agent tools). Returns null when the stage does not exist
// in this org; callers emit their own not-found message.
export async function getLegacyPipelineStageById(
  supabase: Supabase,
  orgId: string,
  stageId: string,
): Promise<Pick<PipelineStage, 'id' | 'name'> | null> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('id', stageId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return (data as Pick<PipelineStage, 'id' | 'name'>) ?? null
}
