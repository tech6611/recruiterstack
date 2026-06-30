import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { resumeJob } from '@/modules/ats/domain/job-lifecycle'

/**
 * POST /api/req-jobs/:id/resume — bring a paused job back to market.
 *
 * Flips status from 'paused' back to 'open'. The apply_token was preserved
 * through the pause (migration 070 only mints on open AND keeps the token
 * across transitions), so the original public apply link revives immediately.
 *
 * NOTE: external job-board postings that pause switched off are NOT auto-
 * relisted here — re-publish them explicitly from the Postings tab.
 *
 * Guard: job must currently be 'paused'.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const result = await resumeJob(supabase, orgId, params.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code })
  return NextResponse.json({ ok: true, status: result.status })
}
