import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import {
  ensureValidMSTokensForUser,
  queryMSFreeBusy,
  MicrosoftNotConnectedError,
} from '@/lib/microsoft/calendar'
import { logger } from '@/lib/logger'

/**
 * GET /api/microsoft/availability
 *
 * Query free/busy via Microsoft Graph getSchedule, using the CURRENT USER's
 * Microsoft connection.
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
    const ctx = await ensureValidMSTokensForUser(userId)
    access_token    = ctx.access_token
    connected_email = ctx.connected_email
  } catch (e) {
    if (e instanceof MicrosoftNotConnectedError) {
      return NextResponse.json(
        { error: 'Microsoft is not connected for your account. Visit Settings → Integrations to connect.' },
        { status: 409 },
      )
    }
    logger.error('[ms-availability] token refresh failed', e)
    return NextResponse.json({ error: 'Microsoft token refresh failed. Please reconnect.' }, { status: 401 })
  }

  try {
    const busyMap = await queryMSFreeBusy(access_token, emails, timeMin, timeMax, timezone)
    return NextResponse.json(
      { data: busyMap, connected_email },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    logger.error('[ms-availability] free/busy query failed', e)
    return NextResponse.json({ error: 'Failed to query Microsoft availability' }, { status: 500 })
  }
}
