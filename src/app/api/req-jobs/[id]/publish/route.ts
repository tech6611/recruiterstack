import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { publishJob } from '@/modules/ats/domain/job-lifecycle'

/**
 * POST /api/req-jobs/:id/publish — flip status to 'open' (first go-live).
 *
 * Guards:
 *   - Job must be 'approved'
 *   - At least one linked Opening must be 'approved'
 *
 * Publishing mints the apply_token (migration 070 trigger fires on → open).
 *
 * NOTE: this is first publish only. A live job that was temporarily frozen is
 * brought back via /resume (paused → open), NOT here. A 'withdrawn' job is
 * terminal and cannot be re-published.
 *
 * Postings can only go live after the Job is open — that gate lives in the
 * postings publish endpoint.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const result = await publishJob(supabase, orgId, params.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code })
  return NextResponse.json({ ok: true, status: result.status })
}
