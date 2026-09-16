// Confidential jobs (Phase 3, Ashby parity): visible only to org admins, the
// job's creator, and people holding a role on the job — its hiring manager, or
// hiring manager / recruiter / coordinator / sourcer on a linked requisition.
// Hidden from the public careers page and from anyone else's lists and detail.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ViewerScope } from '@/lib/rbac'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export type ConfidentialFilter = { all: true } | { all: false; allowed: Set<string>; confidential: Set<string> }

/** Job ids the viewer may see even though they're confidential (or `all`). */
export async function confidentialFilter(supabase: SupabaseClient, orgId: string, scope: ViewerScope): Promise<ConfidentialFilter> {
  if (scope.isAdmin || scope.isOwner) return { all: true }
  const sb = supabase as unknown as Loose
  const allowed = new Set<string>()
  const { data: jobs } = await sb.from('jobs').select('id, created_by, hiring_manager_user_id')
    .eq('org_id', orgId).eq('confidentiality', 'confidential')
  const conf = (jobs ?? []) as Array<{ id: string; created_by: string | null; hiring_manager_user_id: string | null }>
  const confidential = new Set(conf.map(j => j.id))
  if (!conf.length) return { all: false, allowed, confidential }
  for (const j of conf) if (j.created_by === scope.userId || j.hiring_manager_user_id === scope.userId) allowed.add(j.id)
  const { data: links } = await sb.from('job_openings').select('job_id, opening_id').in('job_id', conf.map(j => j.id))
  const openingIds = Array.from(new Set(((links ?? []) as Array<{ opening_id: string }>).map(l => l.opening_id)))
  if (openingIds.length) {
    const { data: mine } = await sb.from('openings').select('id').in('id', openingIds)
      .or(`hiring_manager_id.eq.${scope.userId},recruiter_id.eq.${scope.userId},coordinator_id.eq.${scope.userId},sourcer_id.eq.${scope.userId}`)
      .then((r: Loose) => r.error
        ? sb.from('openings').select('id').in('id', openingIds).or(`hiring_manager_id.eq.${scope.userId},recruiter_id.eq.${scope.userId}`)
        : r)
    const myOpenings = new Set(((mine ?? []) as Array<{ id: string }>).map(o => o.id))
    for (const l of (links ?? []) as Array<{ job_id: string; opening_id: string }>) if (myOpenings.has(l.opening_id)) allowed.add(l.job_id)
  }
  return { all: false, allowed, confidential }
}

export function jobVisible(f: ConfidentialFilter, job: { id: string; confidentiality?: string | null }): boolean {
  if (f.all) return true
  const isConf = job.confidentiality !== undefined ? job.confidentiality === 'confidential' : f.confidential.has(job.id)
  if (!isConf) return true
  return f.allowed.has(job.id)
}

/** Convenience for detail routes: 404 (not 403) so the job's existence isn't leaked. */
export async function canSeeJob(supabase: SupabaseClient, orgId: string, scope: ViewerScope, job: { id: string; confidentiality?: string | null }): Promise<boolean> {
  if (job.confidentiality !== 'confidential') return true
  return jobVisible(await confidentialFilter(supabase, orgId, scope), job)
}
