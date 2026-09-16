import { NextResponse } from 'next/server'
import { withScope } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { loadJobTeam } from '@/modules/ats/domain/job-team'
import { getPendingChange } from '@/lib/openings/change-requests'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// GET /api/jobs/:id/team — "Team on this job", assembled from the job's own
// records (assigned/intake HM, HRIS skip-level, requisition recruiter, stage
// panels). Read-only; change the source record to change the roster.
export const GET = withScope(async (_req, orgId, supabase, { params }, scope) => {
  const sb = supabase as unknown as Loose
  const { data: job } = await sb.from('jobs').select('id, org_id, hiring_manager_user_id')
    .eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const denied = assertCanViewJob(scope, job)
  if (denied) return denied

  const rows = await loadJobTeam(supabase, orgId, params.id)

  // How the hiring manager is changed from the Team card: through the first
  // linked requisition when there is one (the job follows it), else directly.
  const { data: links } = await sb.from('job_openings').select('opening_id, linked_at').eq('job_id', params.id).order('linked_at', { ascending: true }).limit(1)
  const openingId: string | null = links?.[0]?.opening_id ?? null
  let pending: { id: string; proposed_user_id: string | null } | null = null
  if (openingId) {
    const cr = await getPendingChange(supabase, orgId, openingId)
    if (cr && 'hiring_manager_id' in cr.proposed) pending = { id: cr.id, proposed_user_id: (cr.proposed.hiring_manager_id as string | null) ?? null }
  }
  return NextResponse.json({ data: { rows, hm_edit: { mode: openingId ? 'opening' : 'job', opening_id: openingId, pending } } })
})
