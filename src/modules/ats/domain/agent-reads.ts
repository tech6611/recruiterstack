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
