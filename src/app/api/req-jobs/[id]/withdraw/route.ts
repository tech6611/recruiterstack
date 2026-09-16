import { NextRequest, NextResponse } from 'next/server'
import { releaseSeatsForJob, auditJobStatus } from '@/lib/openings/seats'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'

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

  const { data: job } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const j = job as { id: string; status: string }

  if (j.status === 'withdrawn') return NextResponse.json({ ok: true, status: 'withdrawn' })
  if (j.status !== 'open' && j.status !== 'paused') {
    return NextResponse.json(
      { error: `Only an open or paused job can be withdrawn. Current status: '${j.status}'.` },
      { status: 409 },
    )
  }

  // Clear apply_token: withdrawn is terminal, so the public link dies for good.
  // (Resume revives a link via /pause+/resume; withdraw deliberately does not.)
  const { error } = await supabase
    .from('jobs')
    .update({ status: 'withdrawn', apply_token: null })
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

  // Unfilled open seats go back to approved — the headcount survives the job.
  const released = await releaseSeatsForJob(supabase, orgId, params.id, userId)
  await auditJobStatus(orgId, params.id, userId, 'withdrawn', j.status, 'withdrawn', { seats_released: released })

  emitWebhook(orgId, 'job.withdrawn', { job_id: params.id })
    .catch(e => logger.error('[req-jobs withdraw] emit failed', e))

  return NextResponse.json({ ok: true, status: 'withdrawn' })
}
