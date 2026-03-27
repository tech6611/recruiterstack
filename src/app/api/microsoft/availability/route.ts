import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { getValidAccessToken, queryMSFreeBusy, type MSTokens } from '@/lib/microsoft/calendar'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

/**
 * GET /api/microsoft/availability
 *
 * Query free/busy slots via Microsoft Graph getSchedule API.
 * Supports multi-user availability natively.
 *
 * Query params: emails (comma-separated), time_min, time_max (ISO), timezone (IANA)
 * Response: { data: { [email]: [{ start, end }] }, connected_email }
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await supabase
    .from('org_settings')
    .select('ms_access_token, ms_refresh_token, ms_token_expiry, ms_connected_email')
    .eq('org_id', orgId)
    .single() as { data: any; error: any }

  const decryptedAccess  = decryptSafe(settings?.ms_access_token)
  const decryptedRefresh = decryptSafe(settings?.ms_refresh_token)

  if (!decryptedAccess || !decryptedRefresh) {
    return NextResponse.json(
      { error: 'Microsoft is not connected. Visit Settings → Integrations to connect.' },
      { status: 409 }
    )
  }

  const { searchParams } = req.nextUrl
  const emailsParam = searchParams.get('emails') ?? ''
  const emails      = emailsParam.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const timeMin     = searchParams.get('time_min') ?? new Date().toISOString()
  const timeMax     = searchParams.get('time_max') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const timezone    = searchParams.get('timezone') ?? 'UTC'

  if (emails.length === 0) {
    return NextResponse.json({ error: 'emails param is required' }, { status: 400 })
  }

  let accessToken: string
  let freshTokens: MSTokens
  try {
    const result = await getValidAccessToken({
      access_token:  decryptedAccess,
      refresh_token: decryptedRefresh,
      token_expiry:  settings!.ms_token_expiry ?? null,
    })
    accessToken = result.access_token
    freshTokens = result.tokens

    if (freshTokens.access_token !== decryptedAccess) {
      await supabase
        .from('org_settings')
        .update({
          ms_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(freshTokens.access_token) : freshTokens.access_token,
          ms_token_expiry: freshTokens.token_expiry,
        })
        .eq('org_id', orgId)
    }
  } catch (e) {
    logger.error('[ms-availability] token refresh failed', e)
    return NextResponse.json({ error: 'Microsoft token refresh failed. Please reconnect.' }, { status: 401 })
  }

  try {
    const connectedEmail = (settings?.ms_connected_email as string | null) ?? null
    const busyMap = await queryMSFreeBusy(accessToken, emails, timeMin, timeMax, timezone)
    return NextResponse.json(
      { data: busyMap, connected_email: connectedEmail },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    logger.error('[ms-availability] free/busy query failed', e)
    return NextResponse.json({ error: 'Failed to query Microsoft availability' }, { status: 500 })
  }
}
