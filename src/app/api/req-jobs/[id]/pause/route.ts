import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'

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

  const { data: job } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const j = job as { id: string; status: string }

  if (j.status === 'paused') return NextResponse.json({ ok: true, status: 'paused' })
  if (j.status !== 'open') {
    return NextResponse.json(
      { error: `Only an open job can be paused. Current status: '${j.status}'.` },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'paused' })
    .eq('id', params.id)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cascade: switch off any live job-board postings so external ads go dark too.
  // (Resume does NOT auto-relist them — re-posting to external boards can incur
  // cost/side effects, so that stays an explicit action on the Postings tab.)
  const { error: postingsError } = await supabase
    .from('job_postings')
    .update({ is_live: false, unpublished_at: new Date().toISOString() })
    .eq('job_id', params.id)
    .eq('is_live', true)
  if (postingsError) {
    logger.error('[req-jobs pause] failed to unpublish postings', postingsError)
  }

  emitWebhook(orgId, 'job.paused', { job_id: params.id })
    .catch(e => logger.error('[req-jobs pause] emit failed', e))

  return NextResponse.json({ ok: true, status: 'paused' })
}
