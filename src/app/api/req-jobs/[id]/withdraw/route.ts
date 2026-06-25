import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'

/**
 * POST /api/req-jobs/:id/withdraw — take a live job off the market.
 *
 * Flips status from 'open' to 'withdrawn'. Because the public apply route and
 * the apply preview both gate on status = 'open', this immediately makes every
 * corresponding apply link defunct. We also unpublish any live job-board
 * postings so external ads stop pointing at a closed door.
 *
 * 'withdrawn' is a paused-but-revivable stage: re-publishing (the publish
 * endpoint accepts withdrawn → open) reuses the same apply_token, so old links
 * revive. This is distinct from Archive, which is terminal.
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

  const { data: job } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const j = job as { id: string; status: string }

  if (j.status === 'withdrawn') return NextResponse.json({ ok: true, status: 'withdrawn' })
  if (j.status !== 'open') {
    return NextResponse.json(
      { error: `Only an open job can be withdrawn. Current status: '${j.status}'.` },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'withdrawn' })
    .eq('id', params.id)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cascade: switch off any live job-board postings so external ads go dark too.
  const { error: postingsError } = await supabase
    .from('job_postings')
    .update({ is_live: false, unpublished_at: new Date().toISOString() })
    .eq('job_id', params.id)
    .eq('is_live', true)
  if (postingsError) {
    logger.error('[req-jobs withdraw] failed to unpublish postings', postingsError)
  }

  emitWebhook(orgId, 'job.withdrawn', { job_id: params.id })
    .catch(e => logger.error('[req-jobs withdraw] emit failed', e))

  return NextResponse.json({ ok: true, status: 'withdrawn' })
}
