import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { submitJobForApproval } from '@/modules/ats/domain/job-lifecycle'

/**
 * POST /api/req-jobs/:id/submit — kicks off approval for a Job.
 * Validation + the approval-engine call live in the canonical job-lifecycle
 * facade, shared with the copilot `submit_job_for_approval` tool.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const result = await submitJobForApproval(supabase, orgId, userId, params.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code })
  return NextResponse.json({ ok: true, approval_id: result.approvalId, status: result.status })
}
