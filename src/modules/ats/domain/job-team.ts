// "Team on this job" — assembled from records the job already has, not a
// separate roster table. Sources, in display order:
//   1. Hiring manager   — jobs.hiring_manager_user_id, else intake contact
//   2. Skip-level       — the HM's manager via the HRIS reporting line
//                         (employee_profiles.manager_id), same bridge the
//                         approval engine uses for the 'manager' step
//   3. Recruiter        — openings.recruiter_id on each linked requisition,
//                         else the job's creator
//   4. Interviewers     — pipeline_stages.interview_panel, tagged by stage
// Extra hiring managers named on linked requisitions are shown too. People are
// merged by email (fallback user_id) so one person appears once with every tag.

import type { SupabaseClient } from '@supabase/supabase-js'
import { teamMemberName, type TeamMember } from '@/lib/team-members'

export type TeamPerson = { user_id: string | null; name: string | null; email: string | null }

export type JobTeamRole = 'hiring_manager' | 'skip_level' | 'recruiter'

export type JobTeamInput = {
  hiringManager: (TeamPerson & { source: 'assigned' | 'intake' | 'none' }) | null
  skipLevel: TeamPerson | null
  /** Linked requisitions with their named people (already resolved to name/email). */
  openings: Array<{ id: string; title: string; hiring_manager: TeamPerson | null; recruiter: TeamPerson | null }>
  /** Fallback recruiter when no linked requisition names one. */
  jobCreator: TeamPerson | null
  stages: Array<{ name: string; interview_panel: Array<{ name: string; email: string }> | null }>
}

export type JobTeamTag = {
  role: JobTeamRole
  label: string
  /** Where this tag came from — shown as a hint so users know what to change. */
  from: string
}

export type JobTeamRow = {
  key: string
  name: string
  email: string | null
  tags: JobTeamTag[]
  /** Stage names this person interviews on, in pipeline order. */
  stages: string[]
}

const ROLE_LABEL: Record<JobTeamRole, string> = {
  hiring_manager: 'Hiring manager', skip_level: 'Skip-level', recruiter: 'Recruiter',
}
const ROLE_ORDER: Record<JobTeamRole, number> = { hiring_manager: 0, skip_level: 1, recruiter: 2 }

const keyFor = (p: { email: string | null; user_id?: string | null }): string | null => {
  const e = p.email?.trim().toLowerCase()
  if (e) return `email:${e}`
  if (p.user_id) return `user:${p.user_id}`
  return null
}

/** Pure assembly — no I/O, unit-tested. */
export function assembleJobTeam(input: JobTeamInput): JobTeamRow[] {
  const order: string[] = []
  const rows = new Map<string, JobTeamRow>()

  const upsert = (p: TeamPerson, fallbackName: string): JobTeamRow | null => {
    const key = keyFor(p)
    if (!key) return null
    let row = rows.get(key)
    if (!row) {
      row = { key, name: p.name?.trim() || p.email || fallbackName, email: p.email ?? null, tags: [], stages: [] }
      rows.set(key, row); order.push(key)
    } else if (!row.email && p.email) {
      row.email = p.email
    }
    return row
  }
  const tag = (row: JobTeamRow, role: JobTeamRole, from: string) => {
    if (row.tags.some(t => t.role === role)) return
    row.tags.push({ role, label: ROLE_LABEL[role], from })
  }

  const multi = input.openings.length > 1
  const reqFrom = (o: { title: string }) => multi ? `from requisition “${o.title}”` : 'from requisition'

  // 1. Hiring manager
  const hm = input.hiringManager
  if (hm && hm.source !== 'none') {
    const row = upsert(hm, 'Hiring manager')
    if (row) tag(row, 'hiring_manager', hm.source === 'assigned' ? 'assigned on this job' : 'from intake')
  }
  // Additional HMs named on linked requisitions
  for (const o of input.openings) {
    if (!o.hiring_manager) continue
    const row = upsert(o.hiring_manager, 'Hiring manager')
    if (row) tag(row, 'hiring_manager', reqFrom(o))
  }

  // 2. Skip-level
  if (input.skipLevel) {
    const row = upsert(input.skipLevel, 'Skip-level manager')
    if (row) tag(row, 'skip_level', 'hiring manager’s manager in HRIS')
  }

  // 3. Recruiter(s) — from requisitions, else the job creator
  let anyRecruiter = false
  for (const o of input.openings) {
    if (!o.recruiter) continue
    const row = upsert(o.recruiter, 'Recruiter')
    if (row) { tag(row, 'recruiter', reqFrom(o)); anyRecruiter = true }
  }
  if (!anyRecruiter && input.jobCreator) {
    const row = upsert(input.jobCreator, 'Recruiter')
    if (row) tag(row, 'recruiter', 'created this job')
  }

  // 4. Interviewers from stage panels
  for (const s of input.stages) {
    for (const m of s.interview_panel ?? []) {
      const row = upsert({ user_id: null, name: m.name, email: m.email }, 'Interviewer')
      if (row && !row.stages.includes(s.name)) row.stages.push(s.name)
    }
  }

  // Order: role-tagged people by their strongest role, then panel-only interviewers in stage order.
  const rank = (r: JobTeamRow) => r.tags.length ? Math.min(...r.tags.map(t => ROLE_ORDER[t.role])) : 99
  return order.map(k => rows.get(k)!).sort((a, b) => rank(a) - rank(b) || order.indexOf(a.key) - order.indexOf(b.key))
}

// ── Loader ────────────────────────────────────────────────────────────────

// Several columns used here (jobs.hiring_manager_user_id, pipeline_stages.interview_panel,
// employee_profiles.user_id) post-date the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

type UserRow = { user_id: string; users: TeamMember['users'] }

export async function loadJobTeam(supabase: SupabaseClient, orgId: string, jobId: string): Promise<JobTeamRow[]> {
  const sb = supabase as unknown as Loose

  const jobRes = await sb.from('jobs')
    .select('id, created_by, hiring_manager_user_id, custom_fields')
    .eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (!jobRes.data) return []
  const job = jobRes.data as { created_by: string | null; hiring_manager_user_id: string | null; custom_fields: Record<string, unknown> | null }

  const [linksRes, stagesRes] = await Promise.all([
    sb.from('job_openings').select('opening_id').eq('job_id', jobId),
    sb.from('pipeline_stages').select('name, order_index, interview_panel').eq('org_id', orgId).eq('job_id', jobId).order('order_index', { ascending: true }),
  ])
  const openingIds = ((linksRes.data ?? []) as Array<{ opening_id: string }>).map(l => l.opening_id)

  const openingsRes = openingIds.length
    ? await sb.from('openings').select('id, title, hiring_manager_id, recruiter_id, hiring_manager_name, hiring_manager_email').eq('org_id', orgId).in('id', openingIds)
    : { data: [] }
  const openings = (openingsRes.data ?? []) as Array<{
    id: string; title: string; hiring_manager_id: string | null; recruiter_id: string | null
    hiring_manager_name: string | null; hiring_manager_email: string | null
  }>

  // Skip-level: HM user → employee profile → manager's profile → manager's user.
  let skipLevelUserId: string | null = null
  if (job.hiring_manager_user_id) {
    const emp = await sb.from('employee_profiles').select('manager_id')
      .eq('org_id', orgId).eq('user_id', job.hiring_manager_user_id)
      .in('status', ['pending', 'active']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const managerEmpId = (emp.data as { manager_id: string | null } | null)?.manager_id
    if (managerEmpId) {
      const mgr = await sb.from('employee_profiles').select('user_id').eq('id', managerEmpId).eq('org_id', orgId).maybeSingle()
      skipLevelUserId = (mgr.data as { user_id: string | null } | null)?.user_id ?? null
    }
  }

  // Resolve every referenced user id to name/email in one query.
  const ids = new Set<string>()
  for (const id of [job.hiring_manager_user_id, job.created_by, skipLevelUserId]) if (id) ids.add(id)
  for (const o of openings) { if (o.hiring_manager_id) ids.add(o.hiring_manager_id); if (o.recruiter_id) ids.add(o.recruiter_id) }
  const people = new Map<string, TeamPerson>()
  if (ids.size) {
    const usersRes = await sb.from('org_members')
      .select('user_id, users:user_id (full_name, first_name, last_name, email)')
      .eq('org_id', orgId).in('user_id', Array.from(ids))
    for (const m of (usersRes.data ?? []) as UserRow[]) {
      people.set(m.user_id, { user_id: m.user_id, name: teamMemberName(m), email: m.users?.email ?? null })
    }
  }
  const person = (id: string | null): TeamPerson | null => (id ? people.get(id) ?? null : null)

  // Hiring manager: assigned user, else the intake contact.
  let hiringManager: JobTeamInput['hiringManager'] = null
  const assigned = person(job.hiring_manager_user_id)
  if (assigned) hiringManager = { ...assigned, source: 'assigned' }
  else {
    const intake = (job.custom_fields?.intake ?? {}) as { hm_name?: string; hm_email?: string; hiring_manager_name?: string; hiring_manager_email?: string }
    const name = intake.hm_name || intake.hiring_manager_name || null
    const email = intake.hm_email || intake.hiring_manager_email || null
    hiringManager = { user_id: null, name, email, source: name || email ? 'intake' : 'none' }
  }

  return assembleJobTeam({
    hiringManager,
    skipLevel: person(skipLevelUserId),
    openings: openings.map(o => ({
      id: o.id, title: o.title,
      hiring_manager: person(o.hiring_manager_id) ?? (o.hiring_manager_name || o.hiring_manager_email
        ? { user_id: null, name: o.hiring_manager_name, email: o.hiring_manager_email } : null),
      recruiter: person(o.recruiter_id),
    })),
    jobCreator: person(job.created_by),
    stages: ((stagesRes.data ?? []) as Array<{ name: string; interview_panel: Array<{ name: string; email: string }> | null }>)
      .map(s => ({ name: s.name, interview_panel: s.interview_panel })),
  })
}
