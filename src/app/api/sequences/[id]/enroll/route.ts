import { NextRequest, NextResponse } from 'next/server'
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

  // Create enrollments
  const now = new Date().toISOString()
  const enrollments = toEnroll.map(candidateId => ({
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
  const { data: created, error } = await (supabase.from('sequence_enrollments') as any)
    .insert(enrollments)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch all stages to calculate delays upfront
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stages } = await (supabase.from('sequence_stages') as any)
    .select('id, order_index, delay_days, delay_minutes, delay_business_days, send_at')
    .eq('sequence_id', params.id)
    .order('order_index', { ascending: true })

  // Enqueue ALL stage emails upfront for each enrollment
  const nowMs = Date.now()

  for (const enrollment of created ?? []) {
    let cumulativeDelaySeconds = 0

    for (const stage of stages ?? []) {
      if (stage.send_at) {
        // Exact datetime: calculate seconds from now to that time
        const sendAtMs = new Date(stage.send_at).getTime()
        const delayFromNow = Math.max(0, Math.round((sendAtMs - nowMs) / 1000))
        cumulativeDelaySeconds = delayFromNow // absolute, not cumulative
      } else {
        // Relative delay: accumulate days + minutes
        let stageDelayMs = (stage.delay_days ?? 0) * 24 * 60 * 60 * 1000
        stageDelayMs += (stage.delay_minutes ?? 0) * 60 * 1000
        if (stage.delay_business_days) {
          const weekends = Math.floor((stage.delay_days ?? 0) / 5) * 2
          stageDelayMs += weekends * 24 * 60 * 60 * 1000
        }
        cumulativeDelaySeconds += Math.round(stageDelayMs / 1000)
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
      } catch (err) {
        logger.error('Failed to enqueue sequence email', err, {
          enrollmentId: enrollment.id, stageId: stage.id,
        })
      }
    }
  }

  return NextResponse.json({
    data: {
      enrolled_count: toEnroll.length,
      skipped_count: body.candidate_ids.length - toEnroll.length,
    },
  }, { status: 201 })
}
