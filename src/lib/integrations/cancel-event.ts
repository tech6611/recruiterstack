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

import { resolveAllHosts, type ResolvableProvider } from '@/lib/integrations/host-resolver'
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

type DeleteOutcome = 'deleted' | 'gone' | 'failed'

/** Delete the event/meeting from ONE host's calendar. */
async function deleteFromHost(
  provider: ResolvableProvider,
  accessToken: string,
  calendarEventId: string,
  notifyAttendees: boolean,
): Promise<DeleteOutcome> {
  const auth = { Authorization: `Bearer ${accessToken}` }
  try {
    if (provider === 'google') {
      const sendUpdates = notifyAttendees ? 'all' : 'none'
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}?sendUpdates=${sendUpdates}`,
        { method: 'DELETE', headers: auth },
      )
      if (res.ok) return 'deleted'
      if (res.status === 404 || res.status === 410) return 'gone'  // not on this calendar
      logger.warn('[cancel-event] google delete failed', { status: res.status })
      return 'failed'
    }

    if (provider === 'microsoft') {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/events/${calendarEventId}`,
        { method: 'DELETE', headers: auth },
      )
      if (res.ok) return 'deleted'
      if (res.status === 404 || res.status === 410) return 'gone'
      logger.warn('[cancel-event] microsoft delete failed', { status: res.status })
      return 'failed'
    }

    // zoom
    const res = await fetch(
      `https://api.zoom.us/v2/meetings/${calendarEventId}`,
      { method: 'DELETE', headers: auth },
    )
    if (res.ok) return 'deleted'
    if (res.status === 404) return 'gone'
    logger.warn('[cancel-event] zoom delete failed', { status: res.status })
    return 'failed'
  } catch (e) {
    logger.error('[cancel-event] delete request errored', e)
    return 'failed'
  }
}

export async function cancelCalendarEvent(opts: CancelEventOptions): Promise<boolean> {
  const { meetingPlatform, calendarEventId, panelEmails, orgId, notifyAttendees = true } = opts

  // Nothing to cancel — the interview never got a real calendar event.
  if (!meetingPlatform || !calendarEventId) return false

  const provider = PLATFORM_TO_PROVIDER[meetingPlatform]
  if (!provider) return false

  // The event lives on exactly one calendar, but we don't persist which host
  // created it and the resolver's first choice can drift. So try deleting from
  // every host we can authenticate as; a 404 against a calendar that doesn't
  // hold the event is harmless.
  const hosts = await resolveAllHosts(provider, panelEmails, orgId)
  if (hosts.length === 0) {
    logger.warn('[cancel-event] no host token available; cannot cancel calendar event', { provider, orgId })
    return false
  }

  let anyDeleted = false
  let anyGone = false
  for (const host of hosts) {
    const outcome = await deleteFromHost(provider, host.access_token, calendarEventId, notifyAttendees)
    if (outcome === 'deleted') anyDeleted = true
    if (outcome === 'gone')    anyGone = true
  }

  // Success if we actually removed it, or every reachable calendar reports it's
  // already absent. Only a hard failure on every host (and no delete) is a miss.
  return anyDeleted || anyGone
}
