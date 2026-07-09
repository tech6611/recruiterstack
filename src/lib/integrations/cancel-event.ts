/**
 * Calendar-event cancellation helper.
 *
 * Removes the underlying meeting (Google Calendar event, Outlook/Teams event,
 * or Zoom meeting) that was created when an interview was scheduled. Uses the
 * same host-resolver chain that created the event, so it targets the calendar
 * the event actually lives on (a panelist's per-user calendar when available,
 * otherwise the legacy org-level account).
 *
 * Never throws — returns true on success (or if the event was already gone),
 * false if it could not be cancelled. Callers treat cancellation as a
 * best-effort side effect and must not let a failure here break their flow.
 */

import { resolveHost, type ResolvableProvider } from '@/lib/integrations/host-resolver'
import { logger } from '@/lib/logger'

// interviews.meeting_platform → host-resolver provider key
const PLATFORM_TO_PROVIDER: Record<string, ResolvableProvider> = {
  google_meet: 'google',
  ms_teams:    'microsoft',
  zoom:        'zoom',
}

export interface CancelEventOptions {
  /** interviews.meeting_platform ('google_meet' | 'ms_teams' | 'zoom') */
  meetingPlatform: string | null
  /** interviews.calendar_event_id — GCal/Graph event id, or the Zoom meeting id */
  calendarEventId: string | null
  /** Panel emails in the order used at creation, so we resolve the same host. */
  panelEmails: string[]
  orgId: string
  /** Whether to have the provider email attendees about the cancellation. */
  notifyAttendees?: boolean
}

export async function cancelCalendarEvent(opts: CancelEventOptions): Promise<boolean> {
  const { meetingPlatform, calendarEventId, panelEmails, orgId, notifyAttendees = true } = opts

  // Nothing to cancel — the interview never got a real calendar event.
  if (!meetingPlatform || !calendarEventId) return false

  const provider = PLATFORM_TO_PROVIDER[meetingPlatform]
  if (!provider) return false

  try {
    const host = await resolveHost(provider, panelEmails, orgId)
    const auth = { Authorization: `Bearer ${host.access_token}` }

    if (provider === 'google') {
      const sendUpdates = notifyAttendees ? 'all' : 'none'
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}?sendUpdates=${sendUpdates}`,
        { method: 'DELETE', headers: auth },
      )
      // 404/410 → event already gone; treat as success.
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        logger.warn('[cancel-event] google delete failed', { status: res.status })
        return false
      }
      return true
    }

    if (provider === 'microsoft') {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/events/${calendarEventId}`,
        { method: 'DELETE', headers: auth },
      )
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        logger.warn('[cancel-event] microsoft delete failed', { status: res.status })
        return false
      }
      return true
    }

    // zoom
    const res = await fetch(
      `https://api.zoom.us/v2/meetings/${calendarEventId}`,
      { method: 'DELETE', headers: auth },
    )
    if (!res.ok && res.status !== 404) {
      logger.warn('[cancel-event] zoom delete failed', { status: res.status })
      return false
    }
    return true
  } catch (e) {
    // HostTokenUnavailableError or a network error — log and give up quietly.
    logger.error('[cancel-event] could not cancel calendar event', e)
    return false
  }
}
