import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { enqueue } from '@/lib/api/job-queue'
import { computeStageDelaySeconds, DEFAULT_SEND_WINDOW } from '@/lib/sequences/schedule'
import { logger } from '@/lib/logger'

export type EnrollResult =
  | { enrolled: true; enrollmentId: string }
  | {
      enrolled: false
      reason: 'sequence_not_found' | 'sequence_not_active' | 'already_enrolled' | 'error'
      message?: string
    }

/**
 * Enroll ONE candidate into a sequence. Verifies the sequence exists, belongs to
 * the org, and is active; skips if the candidate is already active/paused in it;
 * inserts the enrollment and schedules the first stage. Shared by the enroll API
 * route and the auto-enrollment engine so both behave identically. Safe to call
 * repeatedly — a duplicate call returns `already_enrolled` rather than
 * re-enrolling.
 */
export async function enrollCandidate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    orgId: string
    sequenceId: string
    candidateId: string
    applicationId?: string | null
    enrolledBy?: string | null
    /** Personalized first message (Component 08) — overrides the stage-0 template. */
    intro?: { subject: string; body: string } | null
    /**
     * Review-before-send (Component 08, 8b-2). When true the enrollment is created
     * but HELD — no first send is scheduled — until a recruiter approves it. `jobId`
     * ties the held enrollment back to the job whose Source tab it came from.
     */
    holdForReview?: boolean
    jobId?: string | null
  },
): Promise<EnrollResult> {
  const {
    orgId, sequenceId, candidateId, applicationId = null, enrolledBy = null,
    intro = null, holdForReview = false, jobId = null,
  } = params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, status, kind').eq('id', sequenceId).eq('org_id', orgId).single()
  if (!seq) return { enrolled: false, reason: 'sequence_not_found' }
  if (seq.status !== 'active') return { enrolled: false, reason: 'sequence_not_active' }

  // Skip if the candidate is already moving through this sequence.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase.from('sequence_enrollments') as any)
    .select('id')
    .eq('sequence_id', sequenceId)
    .eq('candidate_id', candidateId)
    .in('status', ['active', 'paused'])
    .limit(1)
  if (existing && existing.length) return { enrolled: false, reason: 'already_enrolled' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stages } = await (supabase.from('sequence_stages') as any)
    .select('*').eq('sequence_id', sequenceId).order('order_index', { ascending: true })
  const firstStage = (stages ?? [])[0]

  const now = new Date().toISOString()
  const enrollmentId = randomUUID()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('sequence_enrollments') as any).insert({
    id: enrollmentId,
    org_id: orgId,
    sequence_id: sequenceId,
    candidate_id: candidateId,
    application_id: applicationId,
    enrolled_by: enrolledBy,
    status: 'active',
    current_stage_index: 0,
    next_send_at: null, // the enqueued job is the sole trigger (dynamic chaining)
    started_at: now,
    intro_subject: intro?.subject ?? null,
    intro_body: intro?.body ?? null,
    awaiting_review: holdForReview,
    job_id: jobId,
  })
  if (error) {
    logger.error('Failed to insert enrollment', error, { sequenceId, candidateId })
    return { enrolled: false, reason: 'error', message: error.message }
  }

  // Held for review: skip scheduling entirely. The approve step (see
  // enqueueFirstStage) schedules the first send once the recruiter signs off.
  if (holdForReview) return { enrolled: true, enrollmentId }

  // Schedule only the first stage; the handler chains the rest from the live list.
  if (firstStage) {
    await enqueueFirstStage(supabase, { orgId, sequenceId, enrollmentId, kind: seq.kind, firstStage })
  }

  return { enrolled: true, enrollmentId }
}

/**
 * Schedule the FIRST stage of a sequence for an enrollment. Extracted so the
 * review-before-send approve step (8b-2) can schedule the same way enrollment does.
 * Pass the already-loaded kind/firstStage if you have them; otherwise they are
 * fetched. 'event' sequences bypass the business-hours window on every stage; the
 * handler applies the same rule to follow-ups. 'drip' stages stay clamped.
 */
export async function enqueueFirstStage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    orgId: string
    sequenceId: string
    enrollmentId: string
    kind?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    firstStage?: any
  },
): Promise<void> {
  const { orgId, sequenceId, enrollmentId } = params
  let { kind, firstStage } = params
  if (kind === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: seq } = await (supabase.from('sequences') as any)
      .select('kind').eq('id', sequenceId).eq('org_id', orgId).single()
    kind = seq?.kind
  }
  if (firstStage === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stages } = await (supabase.from('sequence_stages') as any)
      .select('*').eq('sequence_id', sequenceId).order('order_index', { ascending: true })
    firstStage = (stages ?? [])[0]
  }
  if (!firstStage) return

  const firstWindow = kind === 'event' ? null : DEFAULT_SEND_WINDOW
  try {
    await enqueue({
      orgId,
      jobType: 'sequence_email',
      payload: { enrollmentId, sequenceId },
      delaySeconds: computeStageDelaySeconds(firstStage, new Date(), true, firstWindow),
    })
  } catch (err) {
    logger.error('Failed to enqueue first sequence email', err, { enrollmentId, sequenceId })
  }
}
