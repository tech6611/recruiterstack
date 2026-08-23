import { NextResponse } from 'next/server'
import { withScope } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { listJobAutomationRuns } from '@/modules/ats/domain/pipeline-automations'

// GET /api/jobs/:id/automation-activity — what the automation engine did / would
// do (dry-run suggestions + committed actions) for this job's candidates.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export const GET = withScope(async (_req, orgId, supabase, { params }, scope) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id
  const { data: job } = await sb.from('jobs').select('status, hiring_manager_user_id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  const denied = assertCanViewJob(scope, job)
  if (denied) return denied
  const runs = await listJobAutomationRuns(supabase, orgId, jobId, 50)
  return NextResponse.json({ data: { runs } })
})
