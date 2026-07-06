import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { enqueue } from '@/lib/api/job-queue'
import { logger } from '@/lib/logger'

// PATCH /api/enrollments/[id] — update enrollment status (pause/resume/cancel)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: { status: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const validStatuses = ['active', 'paused', 'cancelled']
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  const update: Record<string, unknown> = { status: body.status }
  if (body.status === 'cancelled') {
    update.completed_at = new Date().toISOString()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequence_enrollments') as any)
    .update(update)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })

  // Resuming: pausing breaks the send chain (the due job runs, sees a non-active
  // enrollment, and returns without scheduling the next step). So on resume we
  // restart the chain — but only if nothing is already queued for this
  // enrollment, to avoid duplicate or premature sends. The next unsent step then
  // goes out promptly and the sequence continues forward (no backlog burst).
  if (body.status === 'active') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase.from('job_queue') as any)
      .select('id', { count: 'exact', head: true })
      .eq('job_type', 'sequence_email')
      .in('status', ['pending', 'failed'])
      .filter('payload->>enrollmentId', 'eq', params.id)

    if (!count) {
      try {
        await enqueue({
          orgId,
          jobType: 'sequence_email',
          payload: { enrollmentId: data.id, sequenceId: data.sequence_id },
        })
      } catch (err) {
        logger.error('Failed to re-enqueue sequence on resume', err, { enrollmentId: params.id })
      }
    }
  }

  return NextResponse.json({ data })
}
