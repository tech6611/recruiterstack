/**
 * Google Calendar / Meet helper
 *
 * Handles:
 *  - Access token refresh (Google OAuth 2.0)
 *  - Creating a Calendar event with an auto-generated Google Meet link
 *  - Querying free/busy slots for availability checking
 *
 * All functions are server-side only (never imported into client bundles).
 */

export interface GoogleTokens {
  access_token: string
  refresh_token: string
  token_expiry: string | null // ISO timestamptz
}

export interface MeetEventPayload {
  summary: string
  description?: string
  start_at: string      // ISO datetime (UTC)
  duration_minutes: number
  organizer_email: string
  attendees: string[]   // email addresses (interviewer + candidate)
  timezone?: string
}

export interface CreatedMeetEvent {
  calendar_event_id: string
  meet_link: string
  html_link: string
}

// ── Token Refresh ─────────────────────────────────────────────────────────────

/**
 * Refreshes a Google OAuth access token using the stored refresh token.
 * Returns updated tokens (access_token + new expiry).
 */
export async function refreshGoogleToken(tokens: GoogleTokens): Promise<GoogleTokens> {
  const clientId     = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google token refresh failed: ${err}`)
  }

  const data = await res.json()
  const expiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()

  return {
    access_token:  data.access_token,
    refresh_token: tokens.refresh_token, // Google only sends a new refresh token occasionally
    token_expiry:  expiry,
  }
}

/**
 * Returns a valid access token, refreshing it if expired or within 5 min of expiry.
 * Returns the (possibly refreshed) tokens so callers can persist updates.
 */
export async function getValidAccessToken(
  tokens: GoogleTokens
): Promise<{ access_token: string; tokens: GoogleTokens }> {
  const buffer = 5 * 60 * 1000 // 5 minutes
  const needsRefresh =
    !tokens.token_expiry ||
    new Date(tokens.token_expiry).getTime() - Date.now() < buffer

  if (needsRefresh) {
    const refreshed = await refreshGoogleToken(tokens)
    return { access_token: refreshed.access_token, tokens: refreshed }
  }

  return { access_token: tokens.access_token, tokens }
}

// ── Create Calendar Event with Meet ─────────────────────────────────────────

/**
 * Creates a Google Calendar event with a Google Meet conference link.
 * Returns the event ID, Meet URL, and HTML link.
 */
export async function createMeetEvent(
  accessToken: string,
  payload: MeetEventPayload
): Promise<CreatedMeetEvent> {
  const start = new Date(payload.start_at)
  const end   = new Date(start.getTime() + payload.duration_minutes * 60 * 1000)
  const tz    = payload.timezone ?? 'UTC'

  const attendees = payload.attendees.map(email => ({ email }))

  // requestId must be unique per event to avoid duplicate conference creation
  const conferenceRequestId = `rs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const event = {
    summary:     payload.summary,
    description: payload.description ?? '',
    start:  { dateTime: start.toISOString(), timeZone: tz },
    end:    { dateTime: end.toISOString(),   timeZone: tz },
    attendees,
    conferenceData: {
      createRequest: {
        requestId:             conferenceRequestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email',  minutes: 60 },
        { method: 'popup',  minutes: 10 },
      ],
    },
  }

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method:  'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Calendar event creation failed: ${err}`)
  }

  const data = await res.json()

  const meetLink =
    data.conferenceData?.entryPoints?.find(
      (ep: { entryPointType: string; uri: string }) => ep.entryPointType === 'video'
    )?.uri ?? ''

  return {
    calendar_event_id: data.id as string,
    meet_link:         meetLink,
    html_link:         data.htmlLink as string,
  }
}

// ── Free/Busy Query ──────────────────────────────────────────────────────────

export interface FreeBusySlot {
  start: string
  end:   string
}

/**
 * Queries the Google Calendar free/busy API for a list of emails
 * over a given time range.
 * Returns a map of email → busy slots (each slot is { start, end } ISO strings).
 */
export async function queryFreeBusy(
  accessToken: string,
  emails: string[],
  timeMin: string,  // ISO
  timeMax: string,  // ISO
  timezone = 'UTC'
): Promise<Record<string, FreeBusySlot[]>> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: timezone,
      items: emails.map(id => ({ id })),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google free/busy query failed: ${err}`)
  }

  const data = await res.json()
  const result: Record<string, FreeBusySlot[]> = {}

  // Google may return keys in a different case than what was sent — normalise with case-insensitive lookup
  const calendarKeys = Object.keys(data.calendars ?? {})
  for (const email of emails) {
    const matchedKey = calendarKeys.find(k => k.toLowerCase() === email.toLowerCase()) ?? email
    result[email] = (data.calendars?.[matchedKey]?.busy ?? []) as FreeBusySlot[]
  }

  return result
}
