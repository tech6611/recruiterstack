import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { enqueue } from '@/lib/api/job-queue'
import { logger } from '@/lib/logger'

/**
 * POST /api/sequences/process
 *
 * Finds active enrollments whose next_send_at has passed and enqueues
 * their next email. Called by the cron job alongside /api/queue/process.
 *
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Find active enrollments ready to send — org_id is directly on the table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ready, error } = await (supabase.from('sequence_enrollments') as any)
    .select('id, org_id, sequence_id')
    .eq('status', 'active')
    .lte('next_send_at', new Date().toISOString())
    .limit(20)

  if (error) {
    logger.error('Failed to fetch ready enrollments', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let enqueued = 0
  for (const enrollment of ready ?? []) {
    const orgId = enrollment.org_id as string
    if (!orgId) continue

    try {
      await enqueue({
        orgId,
        jobType: 'sequence_email',
        payload: { enrollmentId: enrollment.id, sequenceId: enrollment.sequence_id },
      })
      enqueued++
    } catch (err) {
      logger.error('Failed to enqueue sequence email', err, { enrollmentId: enrollment.id })
    }
  }

  return NextResponse.json({ enqueued })
}
