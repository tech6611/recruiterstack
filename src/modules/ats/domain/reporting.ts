import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export async function fetchLegacyAnalyticsInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, appsRes, stagesRes, candsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('id, position_title, department, status')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('applications')
      .select('id, status, source, stage_id, applied_at, hiring_request_id, candidate_id')
      .eq('org_id', orgId),
    supabase
      .from('pipeline_stages')
      .select('id, name, color, order_index, hiring_request_id')
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('candidates')
      .select('id, status')
      .eq('org_id', orgId),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (appsRes.error) throw appsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (candsRes.error) throw candsRes.error

  return {
    jobs: jobsRes.data ?? [],
    apps: appsRes.data ?? [],
    stages: stagesRes.data ?? [],
    candidates: candsRes.data ?? [],
  }
}

// ── Canonical analytics inputs (Phase 3 / C5) ────────────────────────────────
// Mirror of fetchLegacyAnalyticsInputs reading the canonical spine: `jobs`
// (status enum: draft|pending_approval|approved|open|closed|archived),
// applications keyed on job_id, and pipeline_stages keyed on job_id (migrations
// 066/068). The returned shape is IDENTICAL to fetchLegacyAnalyticsInputs —
// jobs expose `position_title`/`department`, and apps/stages expose a
// `hiring_request_id` field carrying the canonical job_id — so the analytics
// route's funnel/source/velocity logic is unchanged; canonical data simply backs
// it. The client is cast to `any` for not-yet-typed canonical columns (job_id),
// as in job-pipelines.ts / rbac.ts.
export async function fetchCanonicalAnalyticsInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, appsRes, stagesRes, candsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, title, status, department:departments(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('applications')
      .select('id, status, source, stage_id, applied_at, job_id, candidate_id')
      .eq('org_id', orgId)
      .not('job_id', 'is', null),
    (supabase as any)
      .from('pipeline_stages')
      .select('id, name, color, order_index, job_id')
      .eq('org_id', orgId)
      .not('job_id', 'is', null)
      .order('order_index'),
    supabase
      .from('candidates')
      .select('id, status')
      .eq('org_id', orgId),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (appsRes.error) throw appsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (candsRes.error) throw candsRes.error

  // Re-key canonical job_id onto `hiring_request_id` and surface
  // title→position_title / department.name→department so the analytics route's
  // existing matching logic (a.hiring_request_id === job.id, s.hiring_request_id
  // === job.id) needs no changes.
  const jobs = ((jobsRes.data ?? []) as Array<{
    id: string
    title: string
    status: string
    department: { name: string } | null
  }>).map(j => ({
    id: j.id,
    position_title: j.title,
    department: j.department?.name ?? null,
    status: j.status,
  }))

  const apps = ((appsRes.data ?? []) as Array<{
    id: string
    status: string
    source: string
    stage_id: string | null
    applied_at: string
    job_id: string
    candidate_id: string
  }>).map(a => ({
    id: a.id,
    status: a.status,
    source: a.source,
    stage_id: a.stage_id,
    applied_at: a.applied_at,
    hiring_request_id: a.job_id,
    candidate_id: a.candidate_id,
  }))

  const stages = ((stagesRes.data ?? []) as Array<{
    id: string
    name: string
    color: string
    order_index: number
    job_id: string
  }>).map(s => ({
    id: s.id,
    name: s.name,
    color: s.color,
    order_index: s.order_index,
    hiring_request_id: s.job_id,
  }))

  return {
    jobs,
    apps,
    stages,
    candidates: candsRes.data ?? [],
  }
}

export async function fetchLegacyDashboardInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, stagesRes, appsRes, candidatesRes, eventsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('org_id', orgId)
      .order('order_index'),

    supabase
      .from('applications')
      .select('id, candidate_id, hiring_request_id, stage_id, status, applied_at, ai_score, ai_recommendation, source')
      .eq('org_id', orgId),

    supabase
      .from('candidates')
      .select('id, name, status, current_title')
      .eq('org_id', orgId),

    supabase
      .from('application_events')
      .select(`
        id, application_id, event_type, to_stage, note, created_at,
        applications (
          candidate_id,
          candidates ( name ),
          hiring_requests ( position_title )
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (candidatesRes.error) throw candidatesRes.error
  if (eventsRes.error) throw eventsRes.error

  return {
    jobs: jobsRes.data ?? [],
    stages: stagesRes.data ?? [],
    apps: appsRes.data ?? [],
    candidates: candidatesRes.data ?? [],
    events: eventsRes.data ?? [],
  }
}

export async function fetchLegacyPipelineExportInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('id, position_title, department')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('id, hiring_request_id, name, order_index')
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('hiring_request_id, stage_id, status')
      .eq('org_id', orgId),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error

  return {
    jobs: jobsRes.data ?? [],
    stages: stagesRes.data ?? [],
    apps: appsRes.data ?? [],
  }
}
