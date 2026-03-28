/**
 * Microsoft Graph / Teams / Outlook Calendar helper
 *
 * Handles:
 *  - Access token refresh (Microsoft identity platform v2.0)
 *  - Creating an Outlook Calendar event with a Teams meeting link
 *  - Querying free/busy schedules via Graph getSchedule
 *
 * Uses the "common" tenant so both work/school and personal accounts are supported.
 * All functions are server-side only (never imported into client bundles).
 */

import type { FreeBusySlot } from '@/lib/google/calendar'

export interface MSTokens {
  access_token: string
  refresh_token: string
  token_expiry: string | null // ISO timestamptz
}

export interface CreatedTeamsMeeting {
  event_id: string
  teams_link: string
  web_link: string
}

const MS_SCOPES = 'Calendars.ReadWrite User.Read offline_access'

// ── Token Refresh ─────────────────────────────────────────────────────────────

/**
 * Refreshes a Microsoft OAuth access token using the stored refresh token.
 */
export async function refreshMSToken(tokens: MSTokens): Promise<MSTokens> {
  const clientId     = process.env.MS_CLIENT_ID!
  const clientSecret = process.env.MS_CLIENT_SECRET!

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type:    'refresh_token',
      scope:         MS_SCOPES,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Microsoft token refresh failed: ${err}`)
  }

  const data = await res.json()
  const expiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? tokens.refresh_token,
    token_expiry:  expiry,
  }
}

/**
 * Returns a valid access token, refreshing it if expired or within 5 min of expiry.
 */
export async function getValidAccessToken(
  tokens: MSTokens
): Promise<{ access_token: string; tokens: MSTokens }> {
  const buffer = 5 * 60 * 1000
  const needsRefresh =
    !tokens.token_expiry ||
    new Date(tokens.token_expiry).getTime() - Date.now() < buffer

  if (needsRefresh) {
    const refreshed = await refreshMSToken(tokens)
    return { access_token: refreshed.access_token, tokens: refreshed }
  }

  return { access_token: tokens.access_token, tokens }
}

// ── Create Calendar Event with Teams Meeting ─────────────────────────────────

export interface TeamsMeetingPayload {
  summary: string
  description?: string
  start_at: string      // ISO datetime (UTC)
  duration_minutes: number
  attendees: string[]   // email addresses
  timezone?: string
}

/**
 * Creates an Outlook Calendar event with a Teams meeting link auto-generated.
 * Setting `isOnlineMeeting: true` with `onlineMeetingProvider: 'teamsForBusiness'`
 * makes Graph create the Teams join URL inline on the event.
 */
export async function createTeamsMeeting(
  accessToken: string,
  payload: TeamsMeetingPayload
): Promise<CreatedTeamsMeeting> {
  const start = new Date(payload.start_at)
  const end   = new Date(start.getTime() + payload.duration_minutes * 60 * 1000)
  const tz    = payload.timezone ?? 'UTC'

  const attendees = payload.attendees.map(email => ({
    emailAddress: { address: email },
    type: 'required' as const,
  }))

  const event = {
    subject: payload.summary,
    body: {
      contentType: 'text',
      content: payload.description ?? '',
    },
    start: { dateTime: start.toISOString(), timeZone: tz },
    end:   { dateTime: end.toISOString(),   timeZone: tz },
    attendees,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Microsoft Calendar event creation failed: ${err}`)
  }

  const data = await res.json()

  return {
    event_id:   data.id as string,
    teams_link: (data.onlineMeeting?.joinUrl as string) ?? '',
    web_link:   (data.webLink as string) ?? '',
  }
}

// ── Free/Busy Query ──────────────────────────────────────────────────────────

/**
 * Queries Microsoft Graph getSchedule API for free/busy data.
 * Supports querying multiple users' availability natively.
 * Returns a map of email → busy slots matching the FreeBusySlot interface.
 */
export async function queryMSFreeBusy(
  accessToken: string,
  emails: string[],
  timeMin: string,
  timeMax: string,
  timezone = 'UTC'
): Promise<Record<string, FreeBusySlot[]>> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      schedules:              emails,
      startTime:              { dateTime: timeMin, timeZone: timezone },
      endTime:                { dateTime: timeMax, timeZone: timezone },
      availabilityViewInterval: 15,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Microsoft free/busy query failed: ${err}`)
  }

  const data = await res.json()
  const result: Record<string, FreeBusySlot[]> = {}

  for (const schedule of (data.value ?? [])) {
    const email = (schedule.scheduleId as string).toLowerCase()
    const items: FreeBusySlot[] = []

    for (const item of (schedule.scheduleItems ?? [])) {
      if (item.status === 'free') continue
      items.push({
        start: item.start?.dateTime ?? '',
        end:   item.end?.dateTime ?? '',
      })
    }

    result[email] = items
  }

  return result
}
