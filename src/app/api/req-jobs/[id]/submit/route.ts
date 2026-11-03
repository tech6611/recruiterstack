import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { submitJob } from '@/lib/openings/job-lifecycle'

/**
 * POST /api/req-jobs/:id/submit — kicks off approval for a Job.
 * Reuses the Phase F engine; the engine picks the right chain via
 * scope_conditions + the job target row.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  // Logic shared with the copilot's change_job_status tool.
  const r = await submitJob(supabase, orgId, params.id, userId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, approval_id: r.approval_id, status: r.status })
}
