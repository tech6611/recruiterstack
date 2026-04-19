import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import {
  ensureValidZoomTokensForUser,
  queryZoomBusy,
  ZoomNotConnectedError,
} from '@/lib/zoom/meetings'
import { logger } from '@/lib/logger'

/**
 * GET /api/zoom/availability
 *
 * Returns the CURRENT USER's Zoom scheduled meetings as busy slots.
 * Zoom has no cross-user free/busy API, so this only reflects the connected user.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { userId } = authResult

  const { searchParams } = req.nextUrl
  const timeMin = searchParams.get('time_min') ?? new Date().toISOString()
  const timeMax = searchParams.get('time_max') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  let access_token: string
  let connected_email: string | null
  try {
    const ctx = await ensureValidZoomTokensForUser(userId)
    access_token    = ctx.access_token
    connected_email = ctx.connected_email
  } catch (e) {
    if (e instanceof ZoomNotConnectedError) {
      return NextResponse.json(
        { error: 'Zoom is not connected for your account. Visit Settings → Integrations to connect.' },
        { status: 409 },
      )
    }
    logger.error('[zoom-availability] token refresh failed', e)
    return NextResponse.json({ error: 'Zoom token refresh failed. Please reconnect.' }, { status: 401 })
  }

  try {
    const key = connected_email ?? 'zoom-user'
    const busySlots = await queryZoomBusy(access_token, timeMin, timeMax)
    return NextResponse.json(
      { data: { [key]: busySlots }, connected_email },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    logger.error('[zoom-availability] meeting list failed', e)
    return NextResponse.json({ error: 'Failed to query Zoom availability' }, { status: 500 })
  }
}
