/**
 * Interview reminder scheduling.
 *
 * Enqueues "interview_reminder" jobs on the durable job queue so the worker
 * fires them at the right time before an interview. Uses the same
 * enqueue-with-delay pattern as sequences and approval SLAs — the job's
 * scheduled_at is set into the future, and processJobs() only picks it up once
 * that time arrives.
 *
 * The reminder intervals are configurable per org (org_settings.reminder_lead_minutes,
 * e.g. {1440, 60} = 24h + 1h before). An empty array turns reminders off; a
 * missing column / row falls back to the 24h + 1h default.
 *
 * A reminder whose fire time is already in the past (or under a minute away) is
 * skipped — the booking confirmation email already covers imminent interviews.
 * The handler re-checks the live interview when the job runs, so a
 * cancel/reschedule between now and then makes the stale reminder a no-op.
 */

import { enqueue, type JobType } from '@/lib/api/job-queue'
import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/** Default intervals (minutes before the interview) when the org hasn't configured any. */
export const DEFAULT_REMINDER_LEAD_MINUTES = [1440, 60]  // 24h, 1h

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
 * Reads the org's configured reminder intervals (minutes before the interview).
 * Returns the default [1440, 60] when unset; an empty array means "reminders off".
 */
export async function getOrgReminderLeadMinutes(orgId: string): Promise<number[]> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('org_settings')
      .select('reminder_lead_minutes')
      .eq('org_id', orgId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .maybeSingle() as { data: any }

    const arr = data?.reminder_lead_minutes
    if (Array.isArray(arr)) {
      // Explicitly set (possibly empty = off). Keep only positive integers.
      return arr.filter((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0)
    }
    return DEFAULT_REMINDER_LEAD_MINUTES
  } catch {
    // Column may not exist yet (pre-migration) — fall back to the default.
    return DEFAULT_REMINDER_LEAD_MINUTES
  }
}

/**
 * Schedules reminders for an interview at the org's configured intervals.
 * Best-effort: never throws, so a queue hiccup can't break the booking flow.
 * Safe to call again after a reschedule — the handler's freshness check drops
 * any older jobs.
 */
export async function scheduleInterviewReminders(input: ScheduleRemindersInput): Promise<void> {
  const { orgId, interviewId, scheduledAt, timezone = null } = input

  const interviewMs = new Date(scheduledAt).getTime()
  if (!Number.isFinite(interviewMs)) {
    logger.warn('[reminders] invalid scheduledAt, skipping', { interviewId, scheduledAt })
    return
  }

  const leadMinutesList = await getOrgReminderLeadMinutes(orgId)
  const now = Date.now()

  for (const leadMinutes of leadMinutesList) {
    const delayMs = interviewMs - leadMinutes * 60_000 - now
    if (delayMs < MIN_DELAY_MS) continue  // fire time already passed / too soon

    try {
      await enqueue({
        orgId,
        jobType: JOB_TYPE,
        payload: {
          interviewId,
          leadMinutes,
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
