/**
 * Interview reminder scheduling.
 *
 * Enqueues "interview_reminder" jobs on the durable job queue so the worker
 * fires them at the right time (24h before and 1h before the interview). Uses
 * the same enqueue-with-delay pattern as sequences and approval SLAs — the
 * job's scheduled_at is set into the future, and processJobs() only picks it
 * up once that time arrives.
 *
 * A reminder whose fire time is already in the past (or under a minute away)
 * is skipped — the booking confirmation email already covers imminent
 * interviews. The handler re-checks the live interview when the job runs, so a
 * cancel/reschedule between now and then makes the stale reminder a no-op.
 */

import { enqueue, type JobType } from '@/lib/api/job-queue'
import { logger } from '@/lib/logger'

export type ReminderKind = '24h' | '1h'

const REMINDER_LEAD_MS: Record<ReminderKind, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '1h':  1 * 60 * 60 * 1000,
}

// Don't bother queuing a reminder that would fire in under a minute.
const MIN_DELAY_MS = 60 * 1000

const JOB_TYPE: JobType = 'interview_reminder'

export interface ScheduleRemindersInput {
  orgId:       string
  interviewId: string
  scheduledAt: string          // ISO time the interview will happen
  timezone?:   string | null   // candidate/booking tz, for reminder formatting
}

/**
 * Schedules the 24h and 1h reminders for an interview. Best-effort: never
 * throws, so a queue hiccup can't break the booking flow. Safe to call again
 * after a reschedule — the handler's freshness check drops any older jobs.
 */
export async function scheduleInterviewReminders(input: ScheduleRemindersInput): Promise<void> {
  const { orgId, interviewId, scheduledAt, timezone = null } = input

  const interviewMs = new Date(scheduledAt).getTime()
  if (!Number.isFinite(interviewMs)) {
    logger.warn('[reminders] invalid scheduledAt, skipping', { interviewId, scheduledAt })
    return
  }

  const now = Date.now()

  for (const kind of Object.keys(REMINDER_LEAD_MS) as ReminderKind[]) {
    const delayMs = interviewMs - REMINDER_LEAD_MS[kind] - now
    if (delayMs < MIN_DELAY_MS) continue  // fire time already passed / too soon

    try {
      await enqueue({
        orgId,
        jobType: JOB_TYPE,
        payload: {
          interviewId,
          kind,
          // The interview time this reminder was scheduled for. The handler
          // compares it against the live row to drop reminders left over from
          // before a reschedule.
          targetScheduledAt: scheduledAt,
          timezone,
        },
        delaySeconds: Math.floor(delayMs / 1000),
      })
    } catch (e) {
      logger.error('[reminders] failed to enqueue interview reminder', e)
    }
  }
}
