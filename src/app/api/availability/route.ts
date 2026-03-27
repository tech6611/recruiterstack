import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { getValidAccessToken as getGoogleToken, queryFreeBusy as queryGoogleBusy, type GoogleTokens } from '@/lib/google/calendar'
import { getValidAccessToken as getZoomToken, queryZoomBusy, type ZoomTokens } from '@/lib/zoom/meetings'
import { getValidAccessToken as getMSToken, queryMSFreeBusy, type MSTokens } from '@/lib/microsoft/calendar'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import type { FreeBusySlot } from '@/lib/google/calendar'

/**
 * GET /api/availability
 *
 * Aggregated availability endpoint — queries all connected calendar providers
 * in parallel and merges busy slots per email.
 *
 * Query params:
 *   emails   — comma-separated list of email addresses
 *   time_min — ISO datetime (start of window, defaults to now)
 *   time_max — ISO datetime (end of window, defaults to now + 7 days)
 *   timezone — IANA timezone name (defaults to UTC)
 *
 * Response: { data: { [email]: [{ start, end }] }, providers: { google, zoom, microsoft } }
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { searchParams } = req.nextUrl
  const emailsParam = searchParams.get('emails') ?? ''
  const emails      = emailsParam.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const timeMin     = searchParams.get('time_min') ?? new Date().toISOString()
  const timeMax     = searchParams.get('time_max') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const timezone    = searchParams.get('timezone') ?? 'UTC'

  if (emails.length === 0) {
    return NextResponse.json({ error: 'emails param is required' }, { status: 400 })
  }

  // Load all provider tokens in one query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await supabase
    .from('org_settings')
    .select(
      'google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email, ' +
      'zoom_access_token, zoom_refresh_token, zoom_token_expiry, zoom_connected_email, ' +
      'ms_access_token, ms_refresh_token, ms_token_expiry, ms_connected_email'
    )
    .eq('org_id', orgId)
    .single() as { data: any; error: any }

  const providers = { google: false, zoom: false, microsoft: false }
  const allBusy: Record<string, FreeBusySlot[]> = {}

  const mergeBusy = (email: string, slots: FreeBusySlot[]) => {
    const key = email.toLowerCase()
    allBusy[key] = [...(allBusy[key] ?? []), ...slots]
  }

  // ── Query each provider in parallel ──────────────────────────────────────

  const queries: Promise<void>[] = []

  // Google
  const gAccess  = decryptSafe(settings?.google_oauth_access_token)
  const gRefresh = decryptSafe(settings?.google_oauth_refresh_token)
  if (gAccess && gRefresh) {
    providers.google = true
    queries.push(
      (async () => {
        try {
          const { access_token, tokens } = await getGoogleToken({
            access_token: gAccess, refresh_token: gRefresh,
            token_expiry: settings!.google_oauth_token_expiry ?? null,
          } as GoogleTokens)
          if (tokens.access_token !== gAccess) {
            await supabase.from('org_settings').update({
              google_oauth_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(tokens.access_token) : tokens.access_token,
              google_oauth_token_expiry: tokens.token_expiry,
            }).eq('org_id', orgId)
          }
          const busyMap = await queryGoogleBusy(access_token, emails, timeMin, timeMax, timezone)
          for (const [email, slots] of Object.entries(busyMap)) mergeBusy(email, slots)
        } catch (e) { logger.error('[availability] Google query failed', e) }
      })()
    )
  }

  // Zoom (only the connected user's meetings)
  const zAccess  = decryptSafe(settings?.zoom_access_token)
  const zRefresh = decryptSafe(settings?.zoom_refresh_token)
  if (zAccess && zRefresh) {
    providers.zoom = true
    queries.push(
      (async () => {
        try {
          const { access_token, tokens } = await getZoomToken({
            access_token: zAccess, refresh_token: zRefresh,
            token_expiry: settings!.zoom_token_expiry ?? null,
          } as ZoomTokens)
          if (tokens.access_token !== zAccess) {
            await supabase.from('org_settings').update({
              zoom_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(tokens.access_token) : tokens.access_token,
              zoom_refresh_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(tokens.refresh_token) : tokens.refresh_token,
              zoom_token_expiry: tokens.token_expiry,
            }).eq('org_id', orgId)
          }
          const slots = await queryZoomBusy(access_token, timeMin, timeMax)
          const zoomEmail = (settings?.zoom_connected_email as string | null)?.toLowerCase()
          if (zoomEmail && emails.includes(zoomEmail)) {
            mergeBusy(zoomEmail, slots)
          }
        } catch (e) { logger.error('[availability] Zoom query failed', e) }
      })()
    )
  }

  // Microsoft
  const mAccess  = decryptSafe(settings?.ms_access_token)
  const mRefresh = decryptSafe(settings?.ms_refresh_token)
  if (mAccess && mRefresh) {
    providers.microsoft = true
    queries.push(
      (async () => {
        try {
          const { access_token, tokens } = await getMSToken({
            access_token: mAccess, refresh_token: mRefresh,
            token_expiry: settings!.ms_token_expiry ?? null,
          } as MSTokens)
          if (tokens.access_token !== mAccess) {
            await supabase.from('org_settings').update({
              ms_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(tokens.access_token) : tokens.access_token,
              ms_token_expiry: tokens.token_expiry,
            }).eq('org_id', orgId)
          }
          const busyMap = await queryMSFreeBusy(access_token, emails, timeMin, timeMax, timezone)
          for (const [email, slots] of Object.entries(busyMap)) mergeBusy(email, slots)
        } catch (e) { logger.error('[availability] Microsoft query failed', e) }
      })()
    )
  }

  await Promise.all(queries)

  return NextResponse.json(
    { data: allBusy, providers },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
