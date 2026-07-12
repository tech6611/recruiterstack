/**
 * Shared side effects for a cancelled interview: remove the real calendar event
 * (Google/Teams/Zoom), notify the candidate + interviewer, and emit the
 * `interview.cancelled` webhook.
 *
 * Used by both cancellation paths so they behave identically:
 *   - the REST API (PATCH/DELETE /api/interviews/[id])
 *   - the copilot tool (update_interview_status → 'cancelled')
 *
 * Never throws — the caller's DB write is the source of truth; these are
 * best-effort secondary effects. It does NOT log the `interview_cancelled`
 * application event; each caller does that itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelCalendarEvent } from '@/lib/integrations/cancel-event'
import { notifyInterviewCancelled } from '@/lib/notifications/interview'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'

export async function runInterviewCancellationSideEffects(
  supabase: SupabaseClient,
  orgId: string,
  interviewId: string,
): Promise<void> {
  const { data: iv } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title)')
    .eq('id', interviewId)
    .eq('org_id', orgId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single() as { data: any; error: any }

  if (!iv) return

  // Resolve the same host chain used at creation: panel emails if present,
  // otherwise the lone interviewer.
  const panelEmails: string[] = Array.isArray(iv.panel) && iv.panel.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? iv.panel.map((m: any) => m?.email).filter(Boolean)
    : (iv.interviewer_email ? [iv.interviewer_email] : [])

  try {
    await cancelCalendarEvent({
      meetingPlatform: iv.meeting_platform ?? null,
      calendarEventId: iv.calendar_event_id ?? null,
      panelEmails,
      orgId,
    })
  } catch (e) {
    logger.error('[interview-cancel] calendar cancellation failed', e)
  }

  try {
    await notifyInterviewCancelled({
      orgId,
      candidateName:    iv.candidate?.name ?? 'Candidate',
      candidateEmail:   iv.candidate?.email ?? '',
      interviewerName:  iv.interviewer_name ?? 'Interviewer',
      interviewerEmail: iv.interviewer_email ?? null,
      positionTitle:    iv.hiring_request?.position_title ?? 'Position',
      scheduledAt:      iv.scheduled_at,
      timezone:         null,
    })
  } catch (e) {
    logger.error('[interview-cancel] cancellation notification failed', e)
  }

  emitWebhook(orgId, 'interview.cancelled', {
    interview_id:      iv.id,
    application_id:    iv.application_id,
    candidate_id:      iv.candidate_id,
    hiring_request_id: iv.hiring_request_id,
    scheduled_at:      iv.scheduled_at,
  }).catch(e => logger.error('[interview-cancel] webhook emit failed', e))
}
