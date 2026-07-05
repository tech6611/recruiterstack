import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@clerk/nextjs/server'
import { withCapability } from '@/lib/api/helpers'
import { enqueue } from '@/lib/api/job-queue'
import { computeStageDelaySeconds } from '@/lib/sequences/schedule'
import { logger } from '@/lib/logger'

// POST /api/sequences/[id]/enroll — enroll candidates
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const { userId } = auth()

  let body: { candidate_ids: string[]; application_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.candidate_ids?.length) {
    return NextResponse.json({ error: 'candidate_ids required' }, { status: 400 })
  }

  // Verify sequence exists, is active, and belongs to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, status')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  if (seq.status !== 'active') {
    return NextResponse.json({ error: 'Sequence must be active to enroll candidates' }, { status: 400 })
  }

  // Check for existing active enrollments to prevent duplicates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingEnrollments } = await (supabase.from('sequence_enrollments') as any)
    .select('candidate_id')
    .eq('sequence_id', params.id)
    .in('status', ['active', 'paused'])
    .in('candidate_id', body.candidate_ids)

  const alreadyEnrolled = new Set((existingEnrollments ?? []).map((e: { candidate_id: string }) => e.candidate_id))
  const toEnroll = body.candidate_ids.filter(id => !alreadyEnrolled.has(id))

  if (toEnroll.length === 0) {
    return NextResponse.json({
      data: { enrolled_count: 0, skipped_count: body.candidate_ids.length },
    })
  }

  // Fetch stages upfront — include all columns needed for scheduling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stages, error: stagesErr } = await (supabase.from('sequence_stages') as any)
    .select('*')
    .eq('sequence_id', params.id)
    .order('order_index', { ascending: true })

  if (stagesErr) {
    logger.error('Failed to fetch stages', stagesErr, { sequenceId: params.id })
  }

  // Create enrollments with client-generated UUIDs
  const now = new Date().toISOString()
  const enrollmentRecords = toEnroll.map(candidateId => ({
    id: randomUUID(),
    org_id: orgId,
    sequence_id: params.id,
    candidate_id: candidateId,
    application_id: body.application_id ?? null,
    enrolled_by: userId ?? null,
    status: 'active',
    current_stage_index: 0,
    next_send_at: now,
    started_at: now,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('sequence_enrollments') as any)
    .insert(enrollmentRecords)

  if (error) {
    logger.error('Failed to insert enrollments', error, { sequenceId: params.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Schedule ONLY the first stage per enrollment. Every subsequent stage is
  // scheduled dynamically by the sequence_email handler after each send, so the
  // sequence's LIVE stage list drives people still in flight — stages added or
  // removed later take effect, instead of a snapshot frozen at enroll time.
  const orderedStages = (stages ?? []).slice()
    .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
  const firstStage = orderedStages[0]
  const nowDate = new Date()
  let totalJobsEnqueued = 0

  for (const enrollment of enrollmentRecords) {
    // Keep next_send_at null: the enqueued job is the sole trigger, so the
    // dormant /sequences/process cron can never create a duplicate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_enrollments') as any)
      .update({ next_send_at: null })
      .eq('id', enrollment.id)

    if (!firstStage) continue // no stages yet — enrollment waits, nothing to schedule

    try {
      await enqueue({
        orgId,
        jobType: 'sequence_email',
        payload: { enrollmentId: enrollment.id, sequenceId: params.id },
        delaySeconds: computeStageDelaySeconds(firstStage, nowDate, true),
      })
      totalJobsEnqueued++
    } catch (err) {
      logger.error('Failed to enqueue first sequence email', err, {
        enrollmentId: enrollment.id, sequenceId: params.id,
      })
    }
  }

  return NextResponse.json({
    data: {
      enrolled_count: toEnroll.length,
      skipped_count: body.candidate_ids.length - toEnroll.length,
      _debug: {
        stagesFound: stages?.length ?? 0,
        stagesError: stagesErr?.message ?? null,
        jobsEnqueued: totalJobsEnqueued,
      },
    },
  }, { status: 201 })
})
