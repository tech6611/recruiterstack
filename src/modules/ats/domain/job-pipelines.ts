import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Application,
  Candidate,
  Database,
  HiringRequest,
  HiringRequestStatus,
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

// ── Canonical apply (migration 068) — keyed on jobs.apply_token ──────────────

export interface CanonicalApplyJob {
  id: string
  org_id: string
  title: string
  status: string
}

export interface CanonicalApplyJobPreview {
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

// ── Canonical board reads (Phase 3 / C4) ─────────────────────────────────────
// Adapter reads that return the EXISTING legacy board shapes
// (LegacyJobPipelineSummary / LegacyJobPipelineDetail) mapped from canonical
// `jobs`, so the /jobs board UI + /api/jobs routes are unchanged. Canonical jobs
// lack most legacy HiringRequest fields (ticket_number, hiring_manager_name,
// budget, generated_jd, …); we map what exists (jobs.title → position_title,
// department_id → departments.name, status, created_at) and fill the rest with
// null / sensible defaults. Stages come from pipeline_stages WHERE job_id and
// applications from applications WHERE job_id (migrations 066/068). The client is
// cast to `any` for not-yet-typed canonical columns, as in rbac.ts.

interface CanonicalJobRow {
  id: string
  org_id: string
  title: string
  status: string
  created_at: string | null
  department: { name: string } | null
}

/** Map a canonical `jobs` row into the legacy HiringRequest-ish shape the board
 *  UI expects. Legacy-only fields are null / sensible defaults. */
function canonicalJobToHiringRequest(row: CanonicalJobRow): HiringRequest {
  return {
    id: row.id,
    org_id: row.org_id,
    ticket_number: null,
    position_title: row.title,
    department: row.department?.name ?? null,
    hiring_manager_name: '',
    hiring_manager_email: null,
    hiring_manager_slack: null,
    intake_token: '',
    apply_link_token: null,
    status: row.status as HiringRequestStatus,
    filled_by_recruiter: true,
    team_context: null,
    level: null,
    headcount: 1,
    location: null,
    remote_ok: false,
    key_requirements: null,
    nice_to_haves: null,
    target_companies: null,
    budget_min: null,
    budget_max: null,
    target_start_date: null,
    additional_notes: null,
    generated_jd: null,
    intake_sent_at: null,
    intake_submitted_at: null,
    jd_sent_at: null,
    created_at: row.created_at ?? '',
    updated_at: row.created_at ?? '',
    auto_advance_score: null,
    auto_reject_score: null,
    auto_advance_stage_id: null,
    auto_email_rejection: false,
    autopilot_recruiter_name: null,
    autopilot_company_name: null,
    scoring_criteria: null,
  }
}

/** Board summaries over canonical `jobs` (Phase 3 / C4). Mirrors
 *  listLegacyJobPipelineSummaries: per job, total_candidates = count of
 *  applications WHERE job_id, and stage_counts from pipeline_stages WHERE job_id
 *  (active apps per stage). Returns the LegacyJobPipelineSummary shape. */
export async function listCanonicalJobBoardSummaries(
  supabase: Supabase,
  orgId: string,
): Promise<LegacyJobPipelineSummary[]> {
  // job_id columns / apply_token are not yet in generated types (migrations
  // 066/068); cast the client as in rbac.ts.
  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, org_id, title, status, created_at, department:departments(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('pipeline_stages')
      .select('id, job_id, name, color, order_index')
      .eq('org_id', orgId)
      .not('job_id', 'is', null),
    (supabase as any)
      .from('applications')
      .select('id, job_id, stage_id, status')
      .eq('org_id', orgId)
      .not('job_id', 'is', null),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error

  const stages = (stagesRes.data ?? []) as Array<
    Pick<PipelineStage, 'id' | 'job_id' | 'name' | 'color' | 'order_index'>
  >
  const apps = (appsRes.data ?? []) as Array<
    Pick<Application, 'id' | 'job_id' | 'stage_id' | 'status'>
  >

  return ((jobsRes.data ?? []) as CanonicalJobRow[]).map(row => {
    const jobStages = stages
      .filter(s => s.job_id === row.id)
      .sort((a, b) => a.order_index - b.order_index)
    const jobApps = apps.filter(a => a.job_id === row.id)
    const activeApps = jobApps.filter(a => a.status === 'active')

    return {
      ...canonicalJobToHiringRequest(row),
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

/** Board detail over a canonical `jobs` row (Phase 3 / C4). Mirrors
 *  getLegacyJobPipelineDetail: the job mapped into the HiringRequest-ish shape,
 *  pipeline_stages WHERE job_id (ordered), and applications WHERE job_id with
 *  their candidate. Candidate identity lives on `people`, so we join
 *  candidates(*, person:people(...)) and flatten name/email onto the candidate so
 *  the returned shape matches the legacy detail (candidate.name / candidate.email). */
export async function getCanonicalJobBoardDetail(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<LegacyJobPipelineDetail | null> {
  // job_id columns are not yet in generated types (migration 066); cast as rbac.ts.
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, org_id, title, status, created_at, department:departments(name)')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .maybeSingle(),
    (supabase as any)
      .from('pipeline_stages')
      .select('*')
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .order('order_index'),
    (supabase as any)
      .from('applications')
      .select(
        '*, ai_score, ai_recommendation, ai_strengths, ai_gaps, ai_criterion_scores, ai_scored_at, candidate:candidates(*, person:people(name, email, phone, linkedin_url))',
      )
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .order('applied_at', { ascending: true }),
  ])

  if (jobRes.error) throw jobRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (!jobRes.data) return null

  // Flatten the people join onto each candidate so name/email/phone/linkedin
  // are present at candidate.* (identity is owned by `people`), matching the
  // shape the legacy detail returns via candidates(*).
  const applications = ((appsRes.data ?? []) as any[]).map(app => {
    const candidate = app.candidate
    const person = candidate?.person ?? null
    return {
      ...app,
      candidate: candidate
        ? {
            ...candidate,
            name: person?.name ?? candidate.name ?? '',
            email: person?.email ?? candidate.email ?? '',
            phone: person?.phone ?? candidate.phone ?? null,
            linkedin_url: person?.linkedin_url ?? candidate.linkedin_url ?? null,
          }
        : candidate,
    }
  }) as unknown as (Application & { candidate: Candidate })[]

  return {
    ...canonicalJobToHiringRequest(jobRes.data as CanonicalJobRow),
    pipeline_stages: (stagesRes.data ?? []) as PipelineStage[],
    applications,
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

/** Public-safe preview for the canonical apply page, keyed on jobs.apply_token.
 *  Mirrors getLegacyApplyJobPreview but reads canonical `jobs` (joining the
 *  department name). A canonical job has no dedicated location/JD column yet,
 *  so location is null and the description doubles as the public JD. */
export async function getCanonicalApplyJobPreview(
  supabase: Supabase,
  token: string,
): Promise<CanonicalApplyJobPreview | null> {
  // apply_token is not in generated types yet (migration 068); cast as in rbac.ts.
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('title, description, status, department:departments(name)')
    .eq('apply_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    title: string
    description: string | null
    status: string
    department: { name: string } | null
  }
  return {
    position_title: row.title,
    department: row.department?.name ?? null,
    location: null,
    generated_jd: row.description,
    status: row.status,
  }
}

/** Resolve a canonical job by its public apply_token, or null. Mirrors
 *  getLegacyApplyJobByToken. A canonical job accepts applications when
 *  status = 'open' (there is no 'posted'/'active', so no auto-transition). */
export async function getCanonicalApplyJobByToken(
  supabase: Supabase,
  token: string,
): Promise<CanonicalApplyJob | null> {
  // apply_token is not in generated types yet (migration 068); cast as in rbac.ts.
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, org_id, title, status')
    .eq('apply_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  return (data as CanonicalApplyJob) ?? null
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
// Source-agnostic: pipeline_stages are looked up by id+org, so this resolves a
// stage whether it belongs to a canonical job or a legacy hiring_request.
export async function getPipelineStageById(
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

// ── Canonical agent lookups (Phase 3 / C5) ───────────────────────────────────
// Mirror the legacy agent helpers (findLegacyJobsForAgent / countLegacyJobs) over
// canonical `jobs`, so the copilot job tools resolve jobs from the canonical spine
// instead of `hiring_requests`. job columns are not yet in the generated Database
// types; cast the client as elsewhere in this module.

export interface CanonicalAgentJob {
  id: string
  title: string
  status: string
}

/** Lookup for get_job_pipeline over canonical `jobs`: by id, or fuzzy by title
 *  for disambiguation. Mirrors findLegacyJobsForAgent. */
export async function findCanonicalJobsForAgent(
  supabase: Supabase,
  orgId: string,
  opts: { jobId?: string; titleQuery?: string; limit?: number },
): Promise<CanonicalAgentJob[]> {
  // jobs columns are not yet in the generated types; cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('jobs')
    .select('id, title, status')
    .eq('org_id', orgId)

  if (opts.jobId) q = q.eq('id', opts.jobId)
  else if (opts.titleQuery) q = q.ilike('title', `%${opts.titleQuery}%`)

  const { data, error } = await q.limit(opts.limit ?? 5)
  if (error) throw error
  return (data ?? []) as CanonicalAgentJob[]
}

/** Total canonical job count for get_dashboard_stats. Mirrors countLegacyJobs. */
export async function countCanonicalJobs(supabase: Supabase, orgId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (error) throw error
  return count ?? 0
}

// ── Canonical job creation (Phase 3 / C3) ────────────────────────────────────

export interface CreateCanonicalJobInput {
  title: string
  department_id?: string | null
  description?: string | null
}

/** Net-new canonical job for create_job_and_pipeline. Inserts into `jobs` with
 *  status 'open' so it can immediately accept applications; the migration-066
 *  jobs-insert trigger seeds the 6 default pipeline_stages keyed on job_id. */
export async function createCanonicalJobForAgent(
  supabase: Supabase,
  orgId: string,
  input: CreateCanonicalJobInput,
): Promise<{ id: string; title: string }> {
  // cast: jobs columns are not yet in the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .insert({
      title:         input.title,
      department_id: input.department_id ?? null,
      description:   input.description ?? null,
      status:        'open',
      org_id:        orgId,
    })
    .select('id, title')
    .single()

  if (error) throw error
  return data as { id: string; title: string }
}

// ── Canonical intake creation (Phase 3 / C5.5) ───────────────────────────────
// Mirror of createLegacyIntakeRequest, but the intake IS a canonical `job`:
// an intake-pending job = status 'draft' (becomes 'open' on intake submit /
// approve). The migration-069 jobs-insert trigger auto-generates
// jobs.intake_token (mirrors the migration-068 apply_token trigger); migration
// 066 seeds the 6 default pipeline_stages keyed on job_id. The generated JD will
// land in jobs.description; structured intake fields live in jobs.custom_fields.
// Canonical jobs have no hiring-manager column, so HM name/email go into
// custom_fields for now. jobs.intake_token / custom_fields are not yet in the
// generated Database types; cast the client as elsewhere in this module.

export interface CreateCanonicalIntakeInput {
  title: string
  hiringManagerName?: string | null
  hiringManagerEmail?: string | null
}

export async function createCanonicalIntakeJob(
  supabase: Supabase,
  orgId: string,
  input: CreateCanonicalIntakeInput,
): Promise<{ id: string; intake_token: string; title: string }> {
  // cast: jobs.intake_token / custom_fields are not yet in the generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .insert({
      title:         input.title,
      status:        'draft',
      org_id:        orgId,
      custom_fields: {
        intake: {
          hiring_manager_name:  input.hiringManagerName ?? null,
          hiring_manager_email: input.hiringManagerEmail ?? null,
        },
      },
    })
    .select('id, intake_token, title')
    .single()

  if (error) throw error
  return data as { id: string; intake_token: string; title: string }
}

// ── Canonical intake reads/writes (Phase 3 / C5.5) ───────────────────────────
//
// Mirror the legacy hiring_requests intake reads/writes used by the three
// /api/intake/[token] routes, but operate on canonical `jobs` keyed by
// jobs.intake_token (migration 069). The HM-facing form data, the AI JD
// (jobs.description), and the structured intake fields (jobs.custom_fields.intake)
// all live on the job. An intake-pending job = status 'draft'; on submit/approve
// it goes live (status 'open' → apply-ready via the apply_token from 068).
// jobs.intake_token / custom_fields are not in the generated Database types yet;
// cast the client as elsewhere in this module.

/** Public-safe intake form data, keyed on jobs.intake_token. Mirrors the legacy
 *  hiring_requests intake GET shape consumed by /intake/[token]. */
export interface CanonicalIntakeJobForm {
  id: string
  position_title: string
  department: string | null
  hiring_manager_name: string | null
  status: string
  intake_submitted_at: string | null
  jd_sent_at: string | null
  created_at: string | null
}

/** Full canonical intake job row needed by the JD-generation + submit paths. */
export interface CanonicalIntakeJob {
  id: string
  org_id: string
  title: string
  status: string
  description: string | null
  department: string | null
  custom_fields: Record<string, unknown>
}

/** Structured intake fields the HM submits (stored in custom_fields.intake). */
export interface CanonicalIntakeFields {
  team_context?: string | null
  level?: string | null
  headcount?: number | null
  location?: string | null
  remote_ok?: boolean | null
  key_requirements?: string | null
  nice_to_haves?: string | null
  target_companies?: string | null
  budget_min?: number | null
  budget_max?: number | null
  target_start_date?: string | null
  additional_notes?: string | null
}

function readIntakeBag(customFields: Record<string, unknown> | null): Record<string, unknown> {
  const cf = customFields ?? {}
  const intake = cf.intake
  return intake && typeof intake === 'object' ? (intake as Record<string, unknown>) : {}
}

/** Resolve a canonical intake job's form data by its intake_token, or null.
 *  Mirrors the legacy hiring_requests intake GET. The department name is read
 *  from the joined departments row; HM name + timestamps from custom_fields.intake. */
export async function getCanonicalIntakeJobByToken(
  supabase: Supabase,
  token: string,
): Promise<CanonicalIntakeJobForm | null> {
  // intake_token / custom_fields not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, title, status, created_at, custom_fields, department:departments(name)')
    .eq('intake_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    id: string
    title: string
    status: string
    created_at: string | null
    custom_fields: Record<string, unknown> | null
    department: { name: string } | null
  }
  const bag = readIntakeBag(row.custom_fields)
  return {
    id: row.id,
    position_title: row.title,
    department: row.department?.name ?? null,
    hiring_manager_name: (bag.hiring_manager_name as string | undefined) ?? null,
    status: row.status,
    intake_submitted_at: (bag.intake_submitted_at as string | undefined) ?? null,
    jd_sent_at: (bag.jd_sent_at as string | undefined) ?? null,
    created_at: row.created_at,
  }
}

/** Resolve the full canonical intake job (incl. custom_fields) by intake_token,
 *  for the JD-generation + submit paths. Returns null when not found. */
export async function getCanonicalIntakeJobFull(
  supabase: Supabase,
  token: string,
): Promise<CanonicalIntakeJob | null> {
  // intake_token / custom_fields not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, org_id, title, status, description, custom_fields, department:departments(name)')
    .eq('intake_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    id: string
    org_id: string
    title: string
    status: string
    description: string | null
    custom_fields: Record<string, unknown> | null
    department: { name: string } | null
  }
  return {
    id: row.id,
    org_id: row.org_id,
    title: row.title,
    status: row.status,
    description: row.description,
    department: row.department?.name ?? null,
    custom_fields: row.custom_fields ?? {},
  }
}

/** Persist the HM intake submission on the canonical job: writes the final JD to
 *  jobs.description, merges structured fields + timestamps into
 *  custom_fields.intake, and flips the job live (status 'open'). Mirrors the
 *  legacy hiring_requests submit, which set generated_jd + status 'jd_approved'.
 *  The optional title lets the HM rename the role. */
export async function submitCanonicalIntakeJob(
  supabase: Supabase,
  token: string,
  args: {
    positionTitle?: string | null
    finalJd: string
    fields: CanonicalIntakeFields
    existingCustomFields: Record<string, unknown>
  },
): Promise<void> {
  const now = new Date().toISOString()
  const intakeBag: Record<string, unknown> = {
    ...readIntakeBag(args.existingCustomFields),
    team_context: args.fields.team_context ?? null,
    level: args.fields.level ?? null,
    headcount: args.fields.headcount ?? 1,
    location: args.fields.location ?? null,
    remote_ok: args.fields.remote_ok ?? false,
    key_requirements: args.fields.key_requirements ?? null,
    nice_to_haves: args.fields.nice_to_haves ?? null,
    target_companies: args.fields.target_companies ?? null,
    budget_min: args.fields.budget_min ?? null,
    budget_max: args.fields.budget_max ?? null,
    target_start_date: args.fields.target_start_date ?? null,
    additional_notes: args.fields.additional_notes ?? null,
    intake_submitted_at: now,
    jd_sent_at: now,
  }
  const customFields: Record<string, unknown> = {
    ...args.existingCustomFields,
    intake: intakeBag,
  }

  const update: Record<string, unknown> = {
    description: args.finalJd,
    custom_fields: customFields,
    status: 'open',
  }
  if (args.positionTitle?.trim()) update.title = args.positionTitle.trim()

  // intake_token / custom_fields not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('jobs')
    .update(update)
    .eq('intake_token', token)

  if (error) throw error
}

/** Store the AI-generated JD on the canonical intake job's description without
 *  changing status (used by the generate-jd preview/persist path). */
export async function setCanonicalIntakeJobJd(
  supabase: Supabase,
  token: string,
  jd: string,
): Promise<void> {
  // intake_token not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('jobs')
    .update({ description: jd })
    .eq('intake_token', token)

  if (error) throw error
}

/** Approve a canonical intake job (one-click email link): flips status to 'open'
 *  when it is still pending. Mirrors the legacy approve route, which set
 *  'jd_approved' from 'jd_sent'/'jd_generated'. Returns the job title, or null
 *  when the link is invalid / already actioned. */
export async function approveCanonicalIntakeJob(
  supabase: Supabase,
  token: string,
): Promise<{ position_title: string } | null> {
  // intake_token not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .update({ status: 'open' })
    .eq('intake_token', token)
    .in('status', ['draft', 'pending_approval', 'approved'])
    .select('title')
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null
  return { position_title: (data as { title: string }).title }
}

// ── Canonical job read/update for the update_job agent tool (Phase 3 / C5.6 — agent B) ──
// Mirror getLegacyJobById / updateLegacyJob over canonical `jobs`. The copilot
// update_job tool only reads `position_title` (for its confirmation string) and
// writes a small set of fields; canonical jobs expose title/description/status,
// so we surface title→position_title and accept those three updatable columns.
// jobs columns are not yet in the generated Database types; cast the client as
// elsewhere in this module.

export interface CanonicalAgentJobRow {
  id: string
  org_id: string
  position_title: string
  status: string
  description: string | null
}

/** Resolve a canonical job by id within the org for the update_job tool, mapping
 *  title→position_title so the tool's confirmation string is unchanged. */
export async function getCanonicalJobById(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<CanonicalAgentJobRow | null> {
  // jobs columns are not yet in the generated types; cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, org_id, title, status, description')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as {
    id: string
    org_id: string
    title: string
    status: string
    description: string | null
  }
  return {
    id: row.id,
    org_id: row.org_id,
    position_title: row.title,
    status: row.status,
    description: row.description,
  }
}

/** Updatable canonical job columns for the update_job tool. */
export interface CanonicalJobUpdate {
  title?: string
  description?: string
  status?: string
}

/** Partial update of a canonical job for update_job. Mirrors updateLegacyJob. */
export async function updateCanonicalJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  updates: CanonicalJobUpdate,
): Promise<void> {
  // jobs columns are not yet in the generated types; cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('jobs')
    .update(updates)
    .eq('id', jobId)
    .eq('org_id', orgId)

  if (error) throw error
}

// ── Canonical scoring + candidate context (Phase 3 / C5.6) ───────────────────
// Mirror the legacy scoring/interview readers (getLegacyJobScoringContext /
// getLegacyCandidateJobContext) over the canonical spine so canonical-job
// candidacies (applications.job_id, hiring_request_id null) are visible to the
// bulk-scoring + interview-scheduling flows. The job is mapped into the legacy
// HiringRequest-ish shape via canonicalJobToHiringRequest (so callers reading
// job.position_title / scoring_criteria / auto_* are unchanged); stages come
// from pipeline_stages WHERE job_id and applications from applications WHERE
// job_id (migrations 066/068). Candidate identity lives on `people`, so we join
// candidates(*, person:people(...)) and flatten name/email/phone/linkedin onto
// the candidate, matching getCanonicalJobBoardDetail. job_id columns are not in
// the generated Database types yet; cast the client as elsewhere in this module.

/** Scoring context over a canonical `jobs` row (Phase 3 / C5.6). Mirrors
 *  getLegacyJobScoringContext: the job mapped into the legacy HiringRequest-ish
 *  shape, pipeline_stages WHERE job_id (ordered), and ACTIVE applications WHERE
 *  job_id with their candidate (identity flattened from people). */
export async function getCanonicalJobScoringContext(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<LegacyJobScoringContext | null> {
  // job_id / people join columns not in generated types yet; cast as rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, org_id, title, status, created_at, department:departments(name)')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .maybeSingle(),
    (supabase as any)
      .from('pipeline_stages')
      .select('*')
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .order('order_index'),
    (supabase as any)
      .from('applications')
      .select('*, candidate:candidates(*, person:people(name, email, phone, linkedin_url))')
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])

  if (jobRes.error) throw jobRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (!jobRes.data) return null

  // Flatten the people join onto each candidate so name/email/phone/linkedin are
  // present at candidate.* (identity is owned by `people`), as in the board detail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applications = ((appsRes.data ?? []) as any[]).map(app => {
    const candidate = app.candidate
    const person = candidate?.person ?? null
    return {
      ...app,
      candidate: candidate
        ? {
            ...candidate,
            name: person?.name ?? candidate.name ?? '',
            email: person?.email ?? candidate.email ?? '',
            phone: person?.phone ?? candidate.phone ?? null,
            linkedin_url: person?.linkedin_url ?? candidate.linkedin_url ?? null,
          }
        : candidate,
    }
  }) as unknown as (Application & { candidate: Candidate })[]

  return {
    job: canonicalJobToHiringRequest(jobRes.data as CanonicalJobRow),
    stages: (stagesRes.data ?? []) as PipelineStage[],
    applications,
  }
}

/** Candidate + job context for a canonical application (Phase 3 / C5.6). Mirrors
 *  getLegacyCandidateJobContext, but resolves both sides from the application:
 *  applications.job_id → the canonical job (title → position_title; canonical
 *  jobs have no ticket_number, so it is null), and applications.candidate_id →
 *  the candidate with identity flattened from people. Returns null when the
 *  application (or its job/candidate) is not found in this org. */
export async function getCanonicalCandidateJobContext(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<LegacyCandidateJobContext | null> {
  // job_id / people join columns not in generated types yet; cast as rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('applications')
    .select(
      'job:jobs(title), candidate:candidates(current_title, location, person:people(name, email))',
    )
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    job: { title: string } | null
    candidate: {
      current_title: string | null
      location: string | null
      person: { name: string | null; email: string | null } | null
    } | null
  }
  if (!row.job || !row.candidate) return null

  const person = row.candidate.person
  return {
    candidate: {
      name: person?.name ?? '',
      email: person?.email ?? '',
      current_title: row.candidate.current_title ?? null,
      location: row.candidate.location ?? null,
    },
    job: {
      position_title: row.job.title,
      ticket_number: null,
    },
  }
}

// ── Canonical sequence-email token fields (Phase 3 / C5.6 — agent B) ─────────
// Resolve the token-population fields for an application's job, covering BOTH
// canonical (applications.job_id) and legacy (applications.hiring_request_id)
// candidacies. Replaces the handler's two-step getApplicationHiringRequestId →
// getLegacyJobTokens, which was blind to canonical-job applications. Canonical
// `jobs` expose only `title` (→ position_title); there is no canonical
// company/recruiter column, so those tokens come from the legacy job when the
// application is legacy, and are empty for canonical jobs. Returns null when the
// application has no resolvable job. job_id / canonical columns are not in the
// generated Database types yet; cast the client as elsewhere in this module.

export interface JobTokenFields {
  position_title: string | null
  autopilot_company_name: string | null
  autopilot_recruiter_name: string | null
}

export async function getApplicationJobTokens(
  supabase: Supabase,
  applicationId: string,
): Promise<JobTokenFields | null> {
  // job_id not in generated types yet (migration 066); cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: app } = await (supabase as any)
    .from('applications')
    .select('job_id, hiring_request_id')
    .eq('id', applicationId)
    .maybeSingle()

  if (!app) return null
  const row = app as { job_id: string | null; hiring_request_id: string | null }

  // Canonical candidacy: read title from `jobs` (no company/recruiter columns).
  if (row.job_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job } = await (supabase as any)
      .from('jobs')
      .select('title')
      .eq('id', row.job_id)
      .maybeSingle()
    if (!job) return null
    return {
      position_title: (job as { title: string }).title,
      autopilot_company_name: null,
      autopilot_recruiter_name: null,
    }
  }

  // Legacy candidacy: fall back to the legacy hiring_requests token fields.
  if (row.hiring_request_id) {
    const legacy = await getLegacyJobTokens(supabase, row.hiring_request_id)
    if (!legacy) return null
    return {
      position_title: legacy.position_title ?? null,
      autopilot_company_name: legacy.autopilot_company_name ?? null,
      autopilot_recruiter_name: legacy.autopilot_recruiter_name ?? null,
    }
  }

  return null
}
