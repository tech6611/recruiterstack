/**
 * Shared calendar busy-time aggregation for a set of interviewer emails.
 *
 * Extracted from the self-schedule route so the availability engine and the
 * candidate self-schedule endpoint compute busy time the same way. Uses the
 * org-level calendar tokens (Google + Microsoft + Zoom) stored in org_settings,
 * refreshing + persisting them as needed. Never throws — a provider that fails
 * simply contributes no busy blocks (fail-open toward showing availability).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getValidAccessToken as getGoogleToken, queryFreeBusy as queryGoogleBusy, type GoogleTokens, type FreeBusySlot } from '@/lib/google/calendar'
import { getValidAccessToken as getZoomToken, queryZoomBusy, type ZoomTokens } from '@/lib/zoom/meetings'
import { getValidAccessToken as getMSToken, queryMSFreeBusy, type MSTokens } from '@/lib/microsoft/calendar'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import type { OrgSettingsUpdate } from '@/lib/types/database'

export type BusyByEmail = Record<string, FreeBusySlot[]>

export interface BusyResult {
  busy: BusyByEmail
  /** Whether the org has any calendar connected — if false, busy is unknowable
   *  and every in-hours slot appears free. Callers surface a "tentative" note. */
  calendarConnected: boolean
}

/**
 * Query Google/Microsoft/Zoom for the busy intervals of `emails` between
 * timeMin and timeMax (ISO). Returns a map keyed by lowercased email, plus
 * whether any calendar was connected to check against.
 */
export async function getBusyForEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  orgId: string,
  emails: string[],
  timeMin: string,
  timeMax: string,
  timezone = 'UTC',
): Promise<BusyResult> {
  const wanted = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)))
  const allBusy: BusyByEmail = {}
  if (wanted.length === 0) return { busy: allBusy, calendarConnected: false }

  const mergeBusy = (email: string, slots: FreeBusySlot[]) => {
    const key = email.toLowerCase()
    allBusy[key] = [...(allBusy[key] ?? []), ...slots]
  }

  const { data: settings } = await supabase
    .from('org_settings')
    .select(
      'google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email, ' +
      'zoom_access_token, zoom_refresh_token, zoom_token_expiry, zoom_connected_email, ' +
      'ms_access_token, ms_refresh_token, ms_token_expiry, ms_connected_email',
    )
    .eq('org_id', orgId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single() as { data: any }

  const queries: Promise<void>[] = []

  // Google
  const gAccess  = decryptSafe(settings?.google_oauth_access_token)
  const gRefresh = decryptSafe(settings?.google_oauth_refresh_token)
  if (gAccess && gRefresh) {
    queries.push((async () => {
      try {
        const { access_token, tokens } = await getGoogleToken({
          access_token: gAccess, refresh_token: gRefresh,
          token_expiry: settings!.google_oauth_token_expiry ?? null,
        } as GoogleTokens)
        if (tokens.access_token !== gAccess) {
          await supabase.from('org_settings').update({
            google_oauth_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(tokens.access_token) : tokens.access_token,
            google_oauth_token_expiry: tokens.token_expiry,
          } as OrgSettingsUpdate).eq('org_id', orgId)
        }
        const busyMap = await queryGoogleBusy(access_token, wanted, timeMin, timeMax, timezone)
        for (const [email, slots] of Object.entries(busyMap)) mergeBusy(email, slots)
      } catch (e) { logger.error('[busy] Google query failed', e) }
    })())
  }

  // Microsoft
  const mAccess  = decryptSafe(settings?.ms_access_token)
  const mRefresh = decryptSafe(settings?.ms_refresh_token)
  if (mAccess && mRefresh) {
    queries.push((async () => {
      try {
        const { access_token, tokens } = await getMSToken({
          access_token: mAccess, refresh_token: mRefresh,
          token_expiry: settings!.ms_token_expiry ?? null,
        } as MSTokens)
        if (tokens.access_token !== mAccess) {
          await supabase.from('org_settings').update({
            ms_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(tokens.access_token) : tokens.access_token,
            ms_token_expiry: tokens.token_expiry,
          } as OrgSettingsUpdate).eq('org_id', orgId)
        }
        const busyMap = await queryMSFreeBusy(access_token, wanted, timeMin, timeMax, timezone)
        for (const [email, slots] of Object.entries(busyMap)) mergeBusy(email, slots)
      } catch (e) { logger.error('[busy] Microsoft query failed', e) }
    })())
  }

  // Zoom — only contributes the connected account's own meetings (no cross-user API).
  const zAccess  = decryptSafe(settings?.zoom_access_token)
  const zRefresh = decryptSafe(settings?.zoom_refresh_token)
  if (zAccess && zRefresh) {
    queries.push((async () => {
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
          } as OrgSettingsUpdate).eq('org_id', orgId)
        }
        const zoomEmail = (settings?.zoom_connected_email as string | null)?.toLowerCase()
        if (zoomEmail && wanted.includes(zoomEmail)) {
          const slots = await queryZoomBusy(access_token, timeMin, timeMax)
          mergeBusy(zoomEmail, slots)
        }
      } catch (e) { logger.error('[busy] Zoom query failed', e) }
    })())
  }

  await Promise.all(queries)

  const calendarConnected = !!((gAccess && gRefresh) || (mAccess && mRefresh) || (zAccess && zRefresh))
  return { busy: allBusy, calendarConnected }
}
