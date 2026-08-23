import { NextResponse } from 'next/server'
import { withScope } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { createAdminClient } from '@/lib/supabase/server'
import { diagnoseJobAutomations } from '@/modules/ats/domain/automation-engine'

// GET /api/jobs/:id/automation-debug — read-only "why aren't my rules firing?"
// Runs the engine's exact logic (via the ADMIN client, like the engine) without
// acting, and surfaces the errors the engine swallows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export const GET = withScope(async (_req, orgId, supabase, { params }, scope) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id
  const { data: job } = await sb.from('jobs').select('status, hiring_manager_user_id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  const denied = assertCanViewJob(scope, job)
  if (denied) return denied

  // Read with the admin client so we see exactly what the engine sees.
  const debug = await diagnoseJobAutomations(createAdminClient(), orgId, jobId)
  return NextResponse.json({ data: debug })
})
