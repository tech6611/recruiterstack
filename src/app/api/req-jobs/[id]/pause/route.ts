import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { pauseJob } from '@/lib/openings/job-lifecycle'

/**
 * POST /api/req-jobs/:id/pause — temporarily freeze a live job.
 *
 * Flips status from 'open' to 'paused'. Because the public apply route and the
 * apply preview both gate on status = 'open', this immediately stops the job
 * from accepting new candidates. We also unpublish any live job-board postings
 * so external ads stop pointing at a closed door.
 *
 * 'paused' is REVERSIBLE: the apply_token is preserved, so /resume (paused →
 * open) revives the very same public link. This is the distinction from
 * /withdraw, which is terminal and clears the token for good.
 *
 * Guard: job must currently be 'open'.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  // Logic shared with the copilot's change_job_status tool.
  const r = await pauseJob(supabase, orgId, params.id, userId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, status: r.status })
}
