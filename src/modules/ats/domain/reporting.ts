import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ScreeningAnswer } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// ── Canonical analytics inputs (Phase 3 / C5) ────────────────────────────────
// Analytics inputs from the canonical spine: `jobs` (status enum:
// draft|pending_approval|approved|open|closed|archived), applications keyed on
// job_id, and pipeline_stages keyed on job_id (migrations 066/068). Jobs expose
// `position_title`/`department`, and apps/stages expose a `hiring_request_id`
// field carrying the canonical job_id — so the analytics route's
// funnel/source/velocity logic is unchanged; canonical data simply backs it. The
// client is cast to `any` for not-yet-typed canonical columns (job_id),
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

// ── Canonical dashboard inputs (Phase 3 / C5.6 — agent B) ────────────────────
// Mirror of fetchLegacyDashboardInputs reading the canonical spine: `jobs`
// (status enum: draft|pending_approval|approved|open|closed|archived),
// pipeline_stages keyed on job_id, applications keyed on job_id, and
// application_events whose application joins canonical `jobs` (migrations
// 066/068). The returned shape is IDENTICAL to fetchLegacyDashboardInputs — jobs
// expose `position_title`/`department`/`status`/`created_at`/`location`, apps and
// stages expose a `hiring_request_id` field carrying the canonical job_id, and
// each event's joined application surfaces `hiring_requests.position_title` — so
// the dashboard route's logic is unchanged. Canonical jobs have no
// ticket_number/location columns, so those are surfaced as null.
// The dashboard route treats job status 'posted' as "live / accepting
// applications"; the canonical equivalent is 'open', and 'jd_approved'
// (ready-to-post) maps to canonical 'approved'. We re-label canonical statuses to
// the legacy strings the route compares against ('open'→'posted',
// 'approved'→'jd_approved') so the route's status checks need no changes.
// The client is cast to `any` for not-yet-typed canonical columns (job_id), as in
// job-pipelines.ts / rbac.ts.

function canonicalDashboardStatus(status: string): string {
  if (status === 'open') return 'posted'
  if (status === 'approved') return 'jd_approved'
  return status
}

export async function fetchCanonicalDashboardInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, stagesRes, appsRes, candidatesRes, eventsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, title, status, created_at, department:departments(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),

    (supabase as any)
      .from('pipeline_stages')
      .select('id, name, color, order_index, job_id')
      .eq('org_id', orgId)
      .not('job_id', 'is', null)
      .order('order_index'),

    (supabase as any)
      .from('applications')
      .select('id, candidate_id, job_id, stage_id, status, applied_at, ai_score, ai_recommendation, source')
      .eq('org_id', orgId)
      .not('job_id', 'is', null),

    supabase
      .from('candidates')
      .select('id, name, status, current_title')
      .eq('org_id', orgId),

    (supabase as any)
      .from('application_events')
      .select(`
        id, application_id, event_type, to_stage, note, created_at,
        applications (
          candidate_id,
          candidates ( name ),
          jobs ( title )
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

  const jobs = ((jobsRes.data ?? []) as Array<{
    id: string
    title: string
    status: string
    created_at: string | null
    department: { name: string } | null
  }>).map(j => ({
    id: j.id,
    position_title: j.title,
    department: j.department?.name ?? null,
    location: null as string | null,
    ticket_number: null as string | null,
    status: canonicalDashboardStatus(j.status),
    created_at: j.created_at,
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

  const apps = ((appsRes.data ?? []) as Array<{
    id: string
    candidate_id: string
    job_id: string
    stage_id: string | null
    status: string
    applied_at: string
    ai_score: number | null
    ai_recommendation: string | null
    source: string | null
  }>).map(a => ({
    id: a.id,
    candidate_id: a.candidate_id,
    hiring_request_id: a.job_id,
    stage_id: a.stage_id,
    status: a.status,
    applied_at: a.applied_at,
    ai_score: a.ai_score,
    ai_recommendation: a.ai_recommendation,
    source: a.source,
  }))

  // Re-key the event join's canonical `jobs.title` onto the
  // `hiring_requests.position_title` path the dashboard route reads.
  const events = ((eventsRes.data ?? []) as any[]).map(e => {
    const application = e.applications
      ? {
          ...e.applications,
          hiring_requests: e.applications.jobs
            ? { position_title: e.applications.jobs.title }
            : null,
        }
      : null
    return { ...e, applications: application }
  })

  return {
    jobs,
    stages,
    apps,
    candidates: candidatesRes.data ?? [],
    events,
  }
}

// ── Canonical pipeline-export inputs (Phase 3 / C5.6 — agent B) ──────────────
// Mirror of fetchLegacyPipelineExportInputs over the canonical spine: `jobs`
// (title→position_title, department_id→departments.name), pipeline_stages keyed
// on job_id, applications keyed on job_id. The returned shape is IDENTICAL — jobs
// expose `position_title`/`department`, and stages/apps expose a
// `hiring_request_id` field carrying the canonical job_id — so the export route's
// row-building logic is unchanged. Client cast as elsewhere in this module.
export async function fetchCanonicalPipelineExportInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, title, department:departments(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('pipeline_stages')
      .select('id, name, order_index, job_id')
      .eq('org_id', orgId)
      .not('job_id', 'is', null)
      .order('order_index'),
    (supabase as any)
      .from('applications')
      .select('job_id, stage_id, status')
      .eq('org_id', orgId)
      .not('job_id', 'is', null),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error

  const jobs = ((jobsRes.data ?? []) as Array<{
    id: string
    title: string
    department: { name: string } | null
  }>).map(j => ({
    id: j.id,
    position_title: j.title,
    department: j.department?.name ?? null,
  }))

  const stages = ((stagesRes.data ?? []) as Array<{
    id: string
    name: string
    order_index: number
    job_id: string
  }>).map(s => ({
    id: s.id,
    hiring_request_id: s.job_id,
    name: s.name,
    order_index: s.order_index,
  }))

  const apps = ((appsRes.data ?? []) as Array<{
    job_id: string
    stage_id: string | null
    status: string
  }>).map(a => ({
    hiring_request_id: a.job_id,
    stage_id: a.stage_id,
    status: a.status,
  }))

  return { jobs, stages, apps }
}

// ── EEO / voluntary compliance reporting (Publish JD Phase 3e) ───────────────
// Aggregates the hidden `applications.eeo_answers` bucket into anonymous,
// org-wide counts. EEO answers are voluntary demographic data that must stay
// hidden from the hiring team and may never influence a hiring decision — so
// this report is COUNTS ONLY, with no candidate, application, or job linkage,
// and the route is gated behind the dedicated `compliance:view` capability.

export interface EeoOptionCount {
  value: string
  count: number
}

export interface EeoQuestionReport {
  field_id: string
  label: string
  responses: number // distinct applications that answered this question
  options: EeoOptionCount[]
}

export interface EeoReport {
  total_applications: number // every application in the org
  responded: number          // applications that gave at least one EEO answer
  questions: EeoQuestionReport[]
}

export async function getEeoReport(supabase: Supabase, orgId: string): Promise<EeoReport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('applications')
    .select('eeo_answers')
    .eq('org_id', orgId)

  if (error) throw error

  const rows = (data ?? []) as { eeo_answers: ScreeningAnswer[] | null }[]
  let responded = 0
  const byField = new Map<string, { label: string; responders: number; counts: Map<string, number> }>()

  for (const row of rows) {
    const answers = Array.isArray(row.eeo_answers) ? row.eeo_answers : []
    const fieldsSeenInRow = new Set<string>()
    let rowAnswered = false

    for (const a of answers) {
      const values = Array.isArray(a.value)
        ? a.value
        : a.value == null || a.value === '' ? [] : [a.value]
      if (values.length === 0) continue
      rowAnswered = true

      let entry = byField.get(a.field_id)
      if (!entry) {
        entry = { label: a.label, responders: 0, counts: new Map() }
        byField.set(a.field_id, entry)
      }
      if (a.label) entry.label = a.label
      if (!fieldsSeenInRow.has(a.field_id)) {
        entry.responders += 1
        fieldsSeenInRow.add(a.field_id)
      }
      for (const v of values) entry.counts.set(v, (entry.counts.get(v) ?? 0) + 1)
    }

    if (rowAnswered) responded += 1
  }

  const questions: EeoQuestionReport[] = Array.from(byField.entries()).map(([field_id, e]) => ({
    field_id,
    label: e.label,
    responses: e.responders,
    options: Array.from(e.counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
  }))

  return { total_applications: rows.length, responded, questions }
}
