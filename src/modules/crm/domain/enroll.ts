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
  },
): Promise<EnrollResult> {
  const { orgId, sequenceId, candidateId, applicationId = null, enrolledBy = null } = params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id, status').eq('id', sequenceId).eq('org_id', orgId).single()
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
  })
  if (error) {
    logger.error('Failed to insert enrollment', error, { sequenceId, candidateId })
    return { enrolled: false, reason: 'error', message: error.message }
  }

  // Schedule only the first stage; the handler chains the rest from the live list.
  if (firstStage) {
    try {
      await enqueue({
        orgId,
        jobType: 'sequence_email',
        payload: { enrollmentId, sequenceId },
        delaySeconds: computeStageDelaySeconds(firstStage, new Date(), true, DEFAULT_SEND_WINDOW),
      })
    } catch (err) {
      logger.error('Failed to enqueue first sequence email', err, { enrollmentId, sequenceId })
    }
  }

  return { enrolled: true, enrollmentId }
}
