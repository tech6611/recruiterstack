import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { getValidAccessToken, queryZoomBusy, type ZoomTokens } from '@/lib/zoom/meetings'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

/**
 * GET /api/zoom/availability
 *
 * Query the connected Zoom account's scheduled meetings as busy slots.
 *
 * Note: Zoom only returns the connected user's own meetings (no cross-user free/busy).
 * The busy slots are keyed by the connected Zoom email.
 *
 * Query params: time_min, time_max (ISO), timezone (IANA)
 * Response: { data: { [email]: [{ start, end }] }, connected_email }
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('zoom_access_token, zoom_refresh_token, zoom_token_expiry, zoom_connected_email')
    .eq('org_id', orgId)
    .single()

  const decryptedAccess  = decryptSafe(settings?.zoom_access_token)
  const decryptedRefresh = decryptSafe(settings?.zoom_refresh_token)

  if (!decryptedAccess || !decryptedRefresh) {
    return NextResponse.json(
      { error: 'Zoom is not connected. Visit Settings → Integrations to connect.' },
      { status: 409 }
    )
  }

  const { searchParams } = req.nextUrl
  const timeMin  = searchParams.get('time_min') ?? new Date().toISOString()
  const timeMax  = searchParams.get('time_max') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  let accessToken: string
  let freshTokens: ZoomTokens
  try {
    const result = await getValidAccessToken({
      access_token:  decryptedAccess,
      refresh_token: decryptedRefresh,
      token_expiry:  settings!.zoom_token_expiry ?? null,
    })
    accessToken = result.access_token
    freshTokens = result.tokens

    if (freshTokens.access_token !== decryptedAccess) {
      await supabase
        .from('org_settings')
        .update({
          zoom_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(freshTokens.access_token) : freshTokens.access_token,
          zoom_refresh_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(freshTokens.refresh_token) : freshTokens.refresh_token,
          zoom_token_expiry: freshTokens.token_expiry,
        })
        .eq('org_id', orgId)
    }
  } catch (e) {
    logger.error('[zoom-availability] token refresh failed', e)
    return NextResponse.json({ error: 'Zoom token refresh failed. Please reconnect.' }, { status: 401 })
  }

  try {
    const connectedEmail = (settings?.zoom_connected_email as string | null) ?? 'zoom-user'
    const busySlots = await queryZoomBusy(accessToken, timeMin, timeMax)
    return NextResponse.json(
      { data: { [connectedEmail]: busySlots }, connected_email: connectedEmail },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    logger.error('[zoom-availability] meeting list failed', e)
    return NextResponse.json({ error: 'Failed to query Zoom availability' }, { status: 500 })
  }
}
