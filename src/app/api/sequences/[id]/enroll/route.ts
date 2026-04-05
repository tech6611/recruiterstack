import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { enqueue } from '@/lib/api/job-queue'
import { logger } from '@/lib/logger'

// POST /api/sequences/[id]/enroll — enroll candidates
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult
  const { userId } = auth()

  let body: { candidate_ids: string[]; application_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.candidate_ids?.length) {
    return NextResponse.json({ error: 'candidate_ids required' }, { status: 400 })
  }

  const supabase = createAdminClient()

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

  // Fetch stages upfront
  // Select only original migration 025 columns — PostgREST cache doesn't know later columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stages, error: stagesErr } = await (supabase.from('sequence_stages') as any)
    .select('id, order_index, delay_days, subject, body, send_on_behalf_of, send_on_behalf_email, created_at, updated_at')
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

  // Enqueue jobs for each enrollment × each stage
  const nowMs = Date.now()
  let totalJobsEnqueued = 0

  for (const enrollment of enrollmentRecords) {
    let cumulativeDelaySeconds = 0

    for (let i = 0; i < (stages ?? []).length; i++) {
      const stage = stages[i]

      // Calculate delay: stage 1 sends immediately, subsequent stages get at least 60s gap
      if (stage.send_at) {
        const sendAtMs = new Date(stage.send_at).getTime()
        cumulativeDelaySeconds = Math.max(0, Math.round((sendAtMs - nowMs) / 1000))
      } else if (i === 0) {
        // First stage: send immediately (no delay)
        cumulativeDelaySeconds = 0
      } else {
        const daySeconds = (stage.delay_days ?? 0) * 86400
        const minSeconds = (stage.delay_minutes ?? 0) * 60
        cumulativeDelaySeconds += Math.max(daySeconds + minSeconds, 60) // minimum 60s gap
      }

      try {
        await enqueue({
          orgId,
          jobType: 'sequence_email',
          payload: {
            enrollmentId: enrollment.id,
            sequenceId: params.id,
            stageId: stage.id,
            stageIndex: stage.order_index,
          },
          delaySeconds: cumulativeDelaySeconds,
        })
        totalJobsEnqueued++
      } catch (err) {
        logger.error('Failed to enqueue sequence email', err, {
          enrollmentId: enrollment.id, stageId: stage.id,
        })
      }
    }

    // If per-stage jobs were created, clear next_send_at so the cron doesn't create duplicate legacy jobs
    if (totalJobsEnqueued > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('sequence_enrollments') as any)
        .update({ next_send_at: null })
        .eq('id', enrollment.id)
    }

    // Fallback: if no stages found or all enqueues failed, create a single legacy job
    if (totalJobsEnqueued === 0) {
      try {
        await enqueue({
          orgId,
          jobType: 'sequence_email',
          payload: { enrollmentId: enrollment.id, sequenceId: params.id },
        })
      } catch (err) {
        logger.error('Failed to enqueue fallback sequence email', err, { enrollmentId: enrollment.id })
      }
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
}
