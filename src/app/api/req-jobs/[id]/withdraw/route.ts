import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { withdrawJob } from '@/modules/ats/domain/job-lifecycle'

/**
 * POST /api/req-jobs/:id/withdraw — permanently retire a job (TERMINAL).
 *
 * Flips status to 'withdrawn' and CLEARS apply_token, so the public apply link
 * is killed for good and can never revive. We also unpublish any live job-board
 * postings so external ads stop pointing at a closed door.
 *
 * This is the "dead" end-state: the requisition is abandoned. To only
 * temporarily stop applications (and later resume the same link), use /pause +
 * /resume instead. The publish endpoint NO LONGER accepts withdrawn → open.
 *
 * Guard: job must currently be 'open' or 'paused'.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const result = await withdrawJob(supabase, orgId, params.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code })
  return NextResponse.json({ ok: true, status: result.status })
}
