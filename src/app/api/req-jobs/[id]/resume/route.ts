import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'

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

  const { data: job } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const j = job as { id: string; status: string }

  if (j.status === 'open') return NextResponse.json({ ok: true, status: 'open' })
  if (j.status !== 'paused') {
    return NextResponse.json(
      { error: `Only a paused job can be resumed. Current status: '${j.status}'.` },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'open' })
    .eq('id', params.id)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  emitWebhook(orgId, 'job.resumed', { job_id: params.id })
    .catch(e => logger.error('[req-jobs resume] emit failed', e))

  return NextResponse.json({ ok: true, status: 'open' })
}
