import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import {
  ensureValidGoogleTokensForUser,
  queryFreeBusy,
  GoogleNotConnectedError,
} from '@/lib/google/calendar'
import { logger } from '@/lib/logger'

/**
 * GET /api/google/availability
 *
 * Query free/busy slots for one or more email addresses, using the CURRENT
 * USER's Google Calendar connection (per-user integration model).
 *
 * Query params:
 *   emails   — comma-separated list of email addresses
 *   time_min — ISO datetime (start of window, defaults to now)
 *   time_max — ISO datetime (end of window, defaults to now + 7 days)
 *   timezone — IANA timezone name (defaults to UTC)
 *
 * Response: { data: { [email]: [{ start, end }] }, connected_email: string | null }
 *
 * Returns 409 if the current user has not connected Google.
 * Returns 401 if the refresh token was revoked / refresh failed.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { userId } = authResult

  const { searchParams } = req.nextUrl
  const emailsParam = searchParams.get('emails') ?? ''
  const emails      = emailsParam.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const timeMin     = searchParams.get('time_min') ?? new Date().toISOString()
  const timeMax     = searchParams.get('time_max') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const timezone    = searchParams.get('timezone') ?? 'UTC'

  if (emails.length === 0) {
    return NextResponse.json({ error: 'emails param is required' }, { status: 400 })
  }

  let access_token: string
  let connected_email: string | null
  try {
    const ctx = await ensureValidGoogleTokensForUser(userId)
    access_token    = ctx.access_token
    connected_email = ctx.connected_email
  } catch (e) {
    if (e instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { error: 'Google Calendar is not connected for your account. Visit Settings → Integrations to connect.' },
        { status: 409 },
      )
    }
    logger.error('[google-availability] token refresh failed', e)
    return NextResponse.json({ error: 'Google token refresh failed. Please reconnect.' }, { status: 401 })
  }

  try {
    const busyMap = await queryFreeBusy(access_token, emails, timeMin, timeMax, timezone)
    return NextResponse.json(
      { data: busyMap, connected_email },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    logger.error('[google-availability] free/busy query failed', e)
    return NextResponse.json({ error: 'Failed to query availability' }, { status: 500 })
  }
}
