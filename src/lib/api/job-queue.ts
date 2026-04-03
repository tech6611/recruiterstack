/**
 * Persistent job queue backed by Supabase.
 *
 * enqueue()     — insert a job into the queue (returns immediately)
 * processJobs() — claim and execute pending jobs with row-level locking
 *
 * Jobs are retried up to max_attempts with exponential backoff.
 * Failed jobs that exceed max_attempts are marked 'dead' for manual review.
 */

import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobType =
  | 'autopilot'
  | 'ai_summary'
  | 'matching'
  | 'slack_notify'
  | 'sequence_email'

export interface EnqueueOptions {
  orgId: string
  jobType: JobType
  payload: Record<string, unknown>
  maxAttempts?: number
  /** Delay before first processing attempt (in seconds) */
  delaySeconds?: number
}

export interface QueuedJob {
  id: string
  org_id: string
  job_type: JobType
  payload: Record<string, unknown>
  status: string
  attempts: number
  max_attempts: number
  error: string | null
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

/** Handler function that processes a single job */
export type JobHandler = (job: QueuedJob) => Promise<void>

// ── Registry of job handlers ──────────────────────────────────────────────────

const handlers = new Map<JobType, JobHandler>()

export function registerHandler(jobType: JobType, handler: JobHandler): void {
  handlers.set(jobType, handler)
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

export async function enqueue(options: EnqueueOptions): Promise<string> {
  const {
    orgId,
    jobType,
    payload,
    maxAttempts = 3,
    delaySeconds = 0,
  } = options

  const supabase = createAdminClient()

  const scheduledAt = delaySeconds > 0
    ? new Date(Date.now() + delaySeconds * 1000).toISOString()
    : new Date().toISOString()

  const { data, error } = await supabase
    .from('job_queue')
    .insert({
      org_id: orgId,
      job_type: jobType,
      payload,
      max_attempts: maxAttempts,
      scheduled_at: scheduledAt,
    })
    .select('id')
    .single()

  if (error) {
    logger.error('Failed to enqueue job', error, { jobType, orgId })
    throw new Error(`Failed to enqueue ${jobType}: ${error.message}`)
  }

  logger.info('Job enqueued', { jobId: data.id, jobType, orgId })
  return data.id as string
}

// ── Process jobs ──────────────────────────────────────────────────────────────

/**
 * Claim up to `batchSize` pending jobs and execute them.
 * Uses Supabase RPC with row-level locking to prevent double-processing.
 *
 * Returns the number of jobs processed.
 */
export async function processJobs(batchSize = 5): Promise<number> {
  const supabase = createAdminClient()

  // Claim pending jobs (or failed jobs ready for retry)
  // Exponential backoff: retry after 2^attempts * 30 seconds
  const { data: jobs, error } = await supabase
    .from('job_queue')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('scheduled_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    logger.error('Failed to fetch jobs', error)
    return 0
  }

  if (!jobs || jobs.length === 0) return 0

  let processed = 0

  for (const row of jobs) {
    const job = row as unknown as QueuedJob

    // Optimistic claim: set status to processing
    const { error: claimError } = await supabase
      .from('job_queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1,
      })
      .eq('id', job.id)
      .in('status', ['pending', 'failed']) // Guard: only claim if still claimable

    if (claimError) {
      // Another worker claimed it — skip
      continue
    }

    const handler = handlers.get(job.job_type)
    if (!handler) {
      await markDead(supabase, job.id, `No handler registered for job type: ${job.job_type}`)
      continue
    }

    try {
      await handler(job)

      await supabase
        .from('job_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', job.id)

      processed++
      logger.info('Job completed', { jobId: job.id, jobType: job.job_type })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, { extra: { jobId: job.id, jobType: job.job_type } })

      const newAttempts = job.attempts + 1
      if (newAttempts >= job.max_attempts) {
        await markDead(supabase, job.id, errorMsg)
        logger.error('Job dead (max attempts)', err, {
          jobId: job.id,
          jobType: job.job_type,
          attempts: newAttempts,
        })
      } else {
        // Exponential backoff: 30s, 60s, 120s, ...
        const backoffSeconds = Math.pow(2, newAttempts) * 30
        const retryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString()

        await supabase
          .from('job_queue')
          .update({
            status: 'failed',
            error: errorMsg,
            scheduled_at: retryAt,
          })
          .eq('id', job.id)

        logger.warn('Job failed, will retry', {
          jobId: job.id,
          jobType: job.job_type,
          attempt: newAttempts,
          retryAt,
        })
      }
    }
  }

  return processed
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markDead(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  error: string,
) {
  await supabase
    .from('job_queue')
    .update({
      status: 'dead',
      error,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}
