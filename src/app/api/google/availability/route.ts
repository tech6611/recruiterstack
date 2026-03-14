import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { getValidAccessToken, queryFreeBusy, type GoogleTokens } from '@/lib/google/calendar'

/**
 * GET /api/google/availability
 *
 * Query free/busy slots for one or more email addresses.
 *
 * Query params:
 *   emails   — comma-separated list of email addresses
 *   time_min — ISO datetime (start of window, defaults to now)
 *   time_max — ISO datetime (end of window, defaults to now + 7 days)
 *   timezone — IANA timezone name (defaults to UTC)
 *
 * Response: { data: { [email]: [{ start, end }] }, connected_email: string | null }
 *
 * The connected_email is the Google account that owns the OAuth token (stored in
 * org_settings.google_connected_email at connection time).
 * It is automatically added to the freebusy query so the connected account's
 * calendar always shows regardless of what panel emails are provided.
 *
 * Returns 409 if Google is not connected for this org.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Load stored Google tokens + connected account email (set at OAuth callback time)
  const { data: settings } = await supabase
    .from('org_settings')
    .select('google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email')
    .eq('org_id', orgId)
    .single()

  if (!settings?.google_oauth_access_token || !settings?.google_oauth_refresh_token) {
    return NextResponse.json(
      { error: 'Google Calendar is not connected. Visit Settings → Integrations to connect.' },
      { status: 409 }
    )
  }

  // Parse query params
  const { searchParams } = req.nextUrl
  const emailsParam = searchParams.get('emails') ?? ''
  const emails      = emailsParam.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const timeMin     = searchParams.get('time_min') ?? new Date().toISOString()
  const timeMax     = searchParams.get('time_max') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const timezone    = searchParams.get('timezone') ?? 'UTC'

  if (emails.length === 0) {
    return NextResponse.json({ error: 'emails param is required' }, { status: 400 })
  }

  // Ensure token is valid (refresh if needed)
  let accessToken: string
  let freshTokens: GoogleTokens
  try {
    const result = await getValidAccessToken({
      access_token:  settings.google_oauth_access_token,
      refresh_token: settings.google_oauth_refresh_token,
      token_expiry:  settings.google_oauth_token_expiry ?? null,
    })
    accessToken  = result.access_token
    freshTokens  = result.tokens

    // Persist refreshed tokens if changed
    if (freshTokens.access_token !== settings.google_oauth_access_token) {
      await supabase
        .from('org_settings')
        .update({
          google_oauth_access_token: freshTokens.access_token,
          google_oauth_token_expiry: freshTokens.token_expiry,
        })
        .eq('org_id', orgId)
    }
  } catch (e) {
    console.error('[google-availability] token refresh failed:', e)
    return NextResponse.json({ error: 'Google token refresh failed. Please reconnect.' }, { status: 401 })
  }

  try {
    // Use the connected email stored in org_settings (captured at OAuth connect time).
    // Auto-add it to the freebusy query so the token owner's calendar always shows —
    // even when panel member emails differ from the connected Google account address.
    const connectedEmail = (settings.google_connected_email as string | null) ?? null
    const emailsToQuery  = [...emails]
    if (connectedEmail && !emailsToQuery.includes(connectedEmail.toLowerCase())) {
      emailsToQuery.push(connectedEmail.toLowerCase())
    }

    const busyMap = await queryFreeBusy(accessToken, emailsToQuery, timeMin, timeMax, timezone)
    return NextResponse.json({ data: busyMap, connected_email: connectedEmail })
  } catch (e) {
    console.error('[google-availability] free/busy query failed:', e)
    return NextResponse.json({ error: 'Failed to query availability' }, { status: 500 })
  }
}
