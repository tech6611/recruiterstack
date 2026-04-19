/**
 * Zoom Meeting helper
 *
 * Handles:
 *  - Access token refresh (Zoom OAuth 2.0)
 *  - Creating a scheduled Zoom meeting
 *  - Listing scheduled meetings for availability checking
 *
 * All functions are server-side only (never imported into client bundles).
 */

import type { FreeBusySlot } from '@/lib/google/calendar'
import { getTokens, updateAfterRefresh, markRefreshFailure } from '@/lib/integrations/store'

export interface ZoomTokens {
  access_token: string
  refresh_token: string
  token_expiry: string | null // ISO timestamptz
}

export interface CreatedZoomMeeting {
  meeting_id: string
  join_url: string
  start_url: string
}

// ── Token Refresh ─────────────────────────────────────────────────────────────

/**
 * Refreshes a Zoom OAuth access token using the stored refresh token.
 * Zoom uses Basic auth (base64(client_id:client_secret)) instead of body params.
 */
export async function refreshZoomToken(tokens: ZoomTokens): Promise<ZoomTokens> {
  const clientId     = process.env.ZOOM_CLIENT_ID!
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!

  const res = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Zoom token refresh failed: ${err}`)
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
  tokens: ZoomTokens
): Promise<{ access_token: string; tokens: ZoomTokens }> {
  const buffer = 5 * 60 * 1000
  const needsRefresh =
    !tokens.token_expiry ||
    new Date(tokens.token_expiry).getTime() - Date.now() < buffer

  if (needsRefresh) {
    const refreshed = await refreshZoomToken(tokens)
    return { access_token: refreshed.access_token, tokens: refreshed }
  }

  return { access_token: tokens.access_token, tokens }
}

// ── User-aware helper (preferred going forward) ────────────────────────────

export interface ValidZoomContext {
  access_token: string
  connected_email: string | null
}

export class ZoomNotConnectedError extends Error {
  constructor(public userId: string) {
    super(`Zoom is not connected for user ${userId}`)
    this.name = 'ZoomNotConnectedError'
  }
}

export async function ensureValidZoomTokensForUser(userId: string): Promise<ValidZoomContext> {
  const stored = await getTokens(userId, 'zoom')
  if (!stored || !stored.refresh_token) {
    throw new ZoomNotConnectedError(userId)
  }

  try {
    const { access_token, tokens } = await getValidAccessToken({
      access_token:  stored.access_token,
      refresh_token: stored.refresh_token,
      token_expiry:  stored.token_expiry,
    })

    if (tokens.access_token !== stored.access_token) {
      // Zoom rotates the refresh token on each refresh — persist it too.
      await updateAfterRefresh(userId, 'zoom', {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokens.token_expiry,
      })
    }

    return { access_token, connected_email: stored.connected_email }
  } catch (err) {
    await markRefreshFailure(userId, 'zoom', err instanceof Error ? err.message : String(err))
    throw err
  }
}

// ── Create Zoom Meeting ──────────────────────────────────────────────────────

export interface ZoomMeetingPayload {
  topic: string
  start_time: string   // ISO datetime (UTC)
  duration: number     // minutes
  timezone?: string
}

/**
 * Creates a scheduled Zoom meeting.
 * Returns the meeting ID, join URL, and start URL.
 */
export async function createZoomMeeting(
  accessToken: string,
  payload: ZoomMeetingPayload
): Promise<CreatedZoomMeeting> {
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic:      payload.topic,
      type:       2, // scheduled meeting
      start_time: payload.start_time,
      duration:   payload.duration,
      timezone:   payload.timezone ?? 'UTC',
      settings: {
        join_before_host:         true,
        participant_video:        true,
        host_video:               true,
        meeting_authentication:   false,
        waiting_room:             false,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Zoom meeting creation failed: ${err}`)
  }

  const data = await res.json()

  return {
    meeting_id: String(data.id),
    join_url:   data.join_url as string,
    start_url:  data.start_url as string,
  }
}

// ── Availability (via meeting list) ──────────────────────────────────────────

/**
 * Queries the connected Zoom user's scheduled meetings and converts them
 * to busy slots matching the FreeBusySlot interface.
 *
 * Note: Zoom does not have a cross-user free/busy API — this only returns
 * the connected account's own meetings.
 */
export async function queryZoomBusy(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<FreeBusySlot[]> {
  const from = new Date(timeMin).toISOString().split('T')[0]
  const to   = new Date(timeMax).toISOString().split('T')[0]

  const res = await fetch(
    `https://api.zoom.us/v2/users/me/meetings?type=scheduled&page_size=100&from=${from}&to=${to}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Zoom meeting list failed: ${err}`)
  }

  const data = await res.json()
  const meetings: { start_time: string; duration: number }[] = data.meetings ?? []

  return meetings.map(m => ({
    start: new Date(m.start_time).toISOString(),
    end:   new Date(new Date(m.start_time).getTime() + m.duration * 60 * 1000).toISOString(),
  }))
}
