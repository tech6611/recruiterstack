/**
 * Read facades for AI-assistant (MCP) tools: compact, org-scoped views of jobs and
 * pipelines. Every function filters by org_id; callers (src/lib/mcp/tools/*) add the
 * per-viewer visibility rules (confidential jobs, limited viewers) on top.
 *
 * Deliberately returns only the fields the tools expose — no contact details.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export type AgentJobStatusFilter = 'active' | 'open' | 'draft' | 'paused' | 'closed' | 'any'

const STATUS_SETS: Record<AgentJobStatusFilter, string[] | null> = {
  active: ['open', 'paused', 'approved', 'draft', 'pending_approval'],
  open: ['open'],
  draft: ['draft', 'pending_approval', 'approved'],
  paused: ['paused'],
  closed: ['closed', 'withdrawn'],
  any: null, // everything except archived
}

export type AgentJobRow = {
  id: string
  title: string
  status: string
  confidentiality: string | null
  location: string | null
  department: string | null
  description: string | null
  comp_min: number | null
  comp_max: number | null
  comp_currency: string | null
  created_at: string
}

function shapeJob(j: Loose): AgentJobRow {
  const intakeLocation = j.custom_fields?.intake?.location
  return {
    id: j.id,
    title: j.title,
    status: j.status,
    confidentiality: j.confidentiality ?? null,
    location: j.location?.name ?? (typeof intakeLocation === 'string' ? intakeLocation : null),
    department: j.department?.name ?? null,
    description: j.description ?? null,
    comp_min: j.comp_min ?? null,
    comp_max: j.comp_max ?? null,
    comp_currency: j.comp_currency ?? null,
    created_at: j.created_at,
  }
}

const JOB_COLUMNS =
  'id, title, status, confidentiality, description, custom_fields, comp_min, comp_max, comp_currency, created_at, department:departments(name), location:locations(name)'

/** Jobs in the org matching an optional title query and status filter (archived never included). */
export async function listJobsForAgent(
  supabase: SupabaseClient,
  orgId: string,
  opts: { query?: string; status?: AgentJobStatusFilter } = {},
): Promise<AgentJobRow[]> {
  let q = (supabase as Loose).from('jobs').select(JOB_COLUMNS).eq('org_id', orgId).neq('status', 'archived')
  const statuses = STATUS_SETS[opts.status ?? 'active']
  if (statuses) q = q.in('status', statuses)
  const query = opts.query?.trim()
  if (query) q = q.ilike('title', `%${query.replace(/[%_,()]/g, ' ')}%`)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return ((data ?? []) as Loose[]).map(shapeJob)
}

/** One job in the org, or null (also null when archived). */
export async function getJobForAgent(supabase: SupabaseClient, orgId: string, jobId: string): Promise<AgentJobRow | null> {
  const { data, error } = await (supabase as Loose)
    .from('jobs').select(JOB_COLUMNS).eq('org_id', orgId).eq('id', jobId).neq('status', 'archived').maybeSingle()
  if (error) throw error
  return data ? shapeJob(data) : null
}

/** Count of ACTIVE applications per job, for the given jobs. */
export async function countActiveApplicationsByJob(
  supabase: SupabaseClient,
  orgId: string,
  jobIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!jobIds.length) return counts
  const { data, error } = await (supabase as Loose)
    .from('applications').select('job_id').eq('org_id', orgId).eq('status', 'active').in('job_id', jobIds)
  if (error) throw error
  for (const r of (data ?? []) as Array<{ job_id: string }>) counts.set(r.job_id, (counts.get(r.job_id) ?? 0) + 1)
  return counts
}

export type AgentStage = { id: string; name: string; order_index: number }

/** The job's hiring stages in order (negative order_index = sourcing-outreach zone, included). */
export async function listStagesForAgent(supabase: SupabaseClient, orgId: string, jobId: string): Promise<AgentStage[]> {
  const { data, error } = await (supabase as Loose)
    .from('pipeline_stages').select('id, name, order_index').eq('org_id', orgId).eq('job_id', jobId).order('order_index')
  if (error) throw error
  return (data ?? []) as AgentStage[]
}

export type AgentPipelineEntry = {
  application_id: string
  candidate_id: string
  stage_id: string | null
  name: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  ai_score: number | null
  fit_bucket: string | null
  applied_at: string | null
  source: string | null
}

export type AgentCandidateCard = {
  id: string
  name: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  experience_years: number | null
  skills: string[]
}

const CARD_COLUMNS = 'id, name, current_title, current_company, location, experience_years, skills, person_id'

/**
 * Search the org's candidates by free text (name, title or company), skills (any of)
 * and location. Optionally restricted to a set of candidate ids (limited viewers).
 * Never returns contact details.
 */
export async function searchCandidatesForMcp(
  supabase: SupabaseClient,
  orgId: string,
  opts: { query?: string; skills?: string[]; location?: string; onlyIds?: string[]; limit: number },
): Promise<AgentCandidateCard[]> {
  if (opts.onlyIds && opts.onlyIds.length === 0) return []
  const sb = supabase as Loose
  const clean = (s: string) => s.replace(/[%_,()*]/g, ' ').trim()
  let q = sb.from('candidates').select(CARD_COLUMNS).eq('org_id', orgId)
  if (opts.onlyIds) q = q.in('id', opts.onlyIds)
  const query = opts.query ? clean(opts.query) : ''
  if (query) {
    const { data: people } = await sb.from('people').select('id').eq('org_id', orgId).ilike('name', `%${query}%`).limit(200)
    const personIds = ((people ?? []) as Array<{ id: string }>).map((p) => p.id)
    const clauses = [`current_title.ilike.%${query}%`, `current_company.ilike.%${query}%`, `name.ilike.%${query}%`]
    if (personIds.length) clauses.push(`person_id.in.(${personIds.join(',')})`)
    q = q.or(clauses.join(','))
  }
  if (opts.location) q = q.ilike('location', `%${clean(opts.location)}%`)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(300)
  if (error) throw error
  let rows = (data ?? []) as Loose[]
  // Skill match is case-insensitive and "any of" — done here so "python" matches "Python".
  if (opts.skills?.length) {
    const wanted = opts.skills.map((s) => s.toLowerCase().trim()).filter(Boolean)
    rows = rows.filter((r) => ((r.skills ?? []) as string[]).some((s) => wanted.includes(s.toLowerCase())))
  }
  return rows.slice(0, opts.limit).map((r) => ({
    id: r.id, name: r.name ?? null, current_title: r.current_title ?? null, current_company: r.current_company ?? null,
    location: r.location ?? null, experience_years: r.experience_years ?? null, skills: (r.skills ?? []) as string[],
  }))
}

/** Candidate ids with an application on any of the given jobs (used for limited viewers). */
export async function candidateIdsOnJobs(supabase: SupabaseClient, orgId: string, jobIds: string[]): Promise<string[]> {
  if (!jobIds.length) return []
  const { data, error } = await (supabase as Loose).from('applications').select('candidate_id').eq('org_id', orgId).in('job_id', jobIds)
  if (error) throw error
  return Array.from(new Set(((data ?? []) as Array<{ candidate_id: string }>).map((r) => r.candidate_id)))
}

export type AgentCandidateDetail = AgentCandidateCard & {
  email: string | null
  phone: string | null
  linkedin_url: string | null
  education: Array<{ degree?: string | null; field?: string | null; school?: string | null; year?: number | null }>
  experiences: Array<{ title: string | null; employer: string | null; start_date: string | null; end_date: string | null; is_current: boolean | null; summary: string | null }>
  applications: Array<{
    id: string; job_id: string | null; job_title: string | null; job_confidentiality: string | null; stage: string | null; status: string
    ai_score: number | null; fit_bucket: string | null; recommendation: string | null; rationale: string | null
    strengths: string[]; gaps: string[]; red_flags: string[]; gate_failures: unknown[]; criterion_scores: unknown
  }>
}

/** Full candidate record for get_candidate. Contact fields are included here; the TOOL decides whether to expose them. */
export async function getCandidateDetailForMcp(supabase: SupabaseClient, orgId: string, candidateId: string): Promise<AgentCandidateDetail | null> {
  const sb = supabase as Loose
  const { data: c, error } = await sb
    .from('candidates').select(`${CARD_COLUMNS}, email, phone, linkedin_url, education`)
    .eq('org_id', orgId).eq('id', candidateId).maybeSingle()
  if (error) throw error
  if (!c) return null
  const [{ data: exps }, { data: apps }] = await Promise.all([
    sb.from('candidate_experiences').select('title, employer, start_date, end_date, is_current, summary, sort_order')
      .eq('org_id', orgId).eq('candidate_id', candidateId).order('sort_order'),
    sb.from('applications')
      .select('id, job_id, status, ai_score, ai_fit_bucket, ai_recommendation, ai_rationale, ai_strengths, ai_gaps, ai_red_flags, ai_gate_failures, ai_criterion_scores, stage:pipeline_stages(name), job:jobs(title, confidentiality, status)')
      .eq('org_id', orgId).eq('candidate_id', candidateId),
  ])
  return {
    id: c.id, name: c.name ?? null, current_title: c.current_title ?? null, current_company: c.current_company ?? null,
    location: c.location ?? null, experience_years: c.experience_years ?? null, skills: (c.skills ?? []) as string[],
    email: c.email ?? null, phone: c.phone ?? null, linkedin_url: c.linkedin_url ?? null,
    education: (c.education ?? []) as AgentCandidateDetail['education'],
    experiences: ((exps ?? []) as Loose[]).map((e) => ({ title: e.title, employer: e.employer, start_date: e.start_date, end_date: e.end_date, is_current: e.is_current, summary: e.summary })),
    applications: ((apps ?? []) as Loose[])
      .filter((a) => a.job?.status !== 'archived')
      .map((a) => ({
        id: a.id, job_id: a.job_id ?? null, job_title: a.job?.title ?? null, job_confidentiality: a.job?.confidentiality ?? null,
        stage: a.stage?.name ?? null, status: a.status, ai_score: a.ai_score ?? null, fit_bucket: a.ai_fit_bucket ?? null,
        recommendation: a.ai_recommendation ?? null, rationale: a.ai_rationale ?? null,
        strengths: a.ai_strengths ?? [], gaps: a.ai_gaps ?? [], red_flags: a.ai_red_flags ?? [],
        gate_failures: a.ai_gate_failures ?? [], criterion_scores: a.ai_criterion_scores ?? null,
      })),
  }
}

/** Active applications for a job with a compact candidate card each (no contact details). */
export async function listPipelineForAgent(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
  opts: { stageId?: string } = {},
): Promise<AgentPipelineEntry[]> {
  let q = (supabase as Loose)
    .from('applications')
    .select('id, candidate_id, stage_id, ai_score, ai_fit_bucket, applied_at, created_at, source, candidate:candidates(name, current_title, current_company, location)')
    .eq('org_id', orgId).eq('job_id', jobId).eq('status', 'active')
  if (opts.stageId) q = q.eq('stage_id', opts.stageId)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as Loose[]).map((a) => ({
    application_id: a.id,
    candidate_id: a.candidate_id,
    stage_id: a.stage_id ?? null,
    name: a.candidate?.name ?? null,
    current_title: a.candidate?.current_title ?? null,
    current_company: a.candidate?.current_company ?? null,
    location: a.candidate?.location ?? null,
    ai_score: a.ai_score ?? null,
    fit_bucket: a.ai_fit_bucket ?? null,
    applied_at: a.applied_at ?? a.created_at ?? null,
    source: a.source ?? null,
  }))
}
