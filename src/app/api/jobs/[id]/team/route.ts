import { NextResponse } from 'next/server'
import { withScope } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { loadJobTeam } from '@/modules/ats/domain/job-team'

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
  return NextResponse.json({ data: { rows } })
})
