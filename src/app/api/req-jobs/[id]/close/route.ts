import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody } from '@/lib/api/helpers'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'
import { closeJob, JOB_CLOSE_REASONS } from '@/lib/openings/seats'

const schema = z.object({
  reason: z.enum(JOB_CLOSE_REASONS.map(r => r.value) as [string, ...string[]]),
  note: z.string().trim().max(2000).optional().nullable(),
  /** Also close this job's open/approved seats (default true — closing a job usually ends the headcount). */
  close_open_seats: z.boolean().optional().default(true),
})

/** POST /api/req-jobs/:id/close — close a job with a reason. Postings come down; the public link dies. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth
  const body = await parseBody(req, schema)
  if (body instanceof NextResponse) return body
  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const r = await closeJob(supabase, orgId, params.id, body.reason as never, body.note ?? null, userId, { closeOpenSeats: body.close_open_seats })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  emitWebhook(orgId, 'job.closed' as never, { job_id: params.id, reason: body.reason }).catch(e => logger.error('[req-jobs close] emit failed', e))
  return NextResponse.json({ ok: true, status: 'closed', seats_closed: r.seats_closed })
}
