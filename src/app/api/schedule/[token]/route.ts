import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getValidAccessToken as getGoogleToken, queryFreeBusy as queryGoogleBusy, type GoogleTokens } from '@/lib/google/calendar'
import { getValidAccessToken as getZoomToken, queryZoomBusy, type ZoomTokens } from '@/lib/zoom/meetings'
import { getValidAccessToken as getMSToken, queryMSFreeBusy, type MSTokens } from '@/lib/microsoft/calendar'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import type { FreeBusySlot } from '@/lib/google/calendar'
import type { OrgSettingsUpdate } from '@/lib/types/database'

// GET /api/schedule/[token] — public, no auth
// Returns interview metadata + panel busy slots for the candidate to see available times
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const supabase = createAdminClient()

  // Fetch interview by token, join candidate + hiring request
  const { data: interview, error } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title)')
    .eq('self_schedule_token', token)
    .single() as { data: any; error: any }

  if (error || !interview) {
    return NextResponse.json({ error: 'Invalid or expired scheduling link' }, { status: 404 })
  }

  // Check expiry
  if (interview.self_schedule_expires_at && new Date(interview.self_schedule_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This scheduling link has expired. Please contact your recruiter for a new one.' }, { status: 410 })
  }

  // Check not cancelled
  if (interview.status === 'cancelled') {
    return NextResponse.json({ error: 'This interview has been cancelled. Please contact your recruiter.' }, { status: 410 })
  }

  // Time window: next 14 days from now
  const { searchParams } = req.nextUrl
  const weekOffset = parseInt(searchParams.get('week') ?? '0', 10)
  const now = new Date()
  // Anchor to start of current week + offset
  const dow = now.getDay()
  const daysToMon = dow === 0 ? -6 : -(dow - 1)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + daysToMon + weekOffset * 7)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const timeMin = weekStart.toISOString()
  const timeMax = weekEnd.toISOString()
  const timezone = searchParams.get('timezone') ?? 'UTC'

  // Get panel emails from panel JSONB
  const panelMembers: { name: string; email: string }[] = interview.panel ?? []
  const emails = panelMembers.map((m: any) => m.email?.trim().toLowerCase()).filter(Boolean)

  // Load org calendar credentials
  const { data: settings } = await supabase
    .from('org_settings')
    .select(
      'google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email, ' +
      'zoom_access_token, zoom_refresh_token, zoom_token_expiry, zoom_connected_email, ' +
      'ms_access_token, ms_refresh_token, ms_token_expiry, ms_connected_email'
    )
    .eq('org_id', interview.org_id)
    .single() as { data: any; error: any }

  const allBusy: Record<string, FreeBusySlot[]> = {}
  const mergeBusy = (email: string, slots: FreeBusySlot[]) => {
    const key = email.toLowerCase()
    allBusy[key] = [...(allBusy[key] ?? []), ...slots]
  }

  const queries: Promise<void>[] = []

  // Google
  const gAccess  = decryptSafe(settings?.google_oauth_access_token)
  const gRefresh = decryptSafe(settings?.google_oauth_refresh_token)
  if (gAccess && gRefresh && emails.length > 0) {
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
          } as OrgSettingsUpdate).eq('org_id', interview.org_id)
        }
        const busyMap = await queryGoogleBusy(access_token, emails, timeMin, timeMax, timezone)
        for (const [email, slots] of Object.entries(busyMap)) mergeBusy(email, slots)
      } catch (e) { logger.error('[schedule] Google query failed', e) }
    })())
  }

  // Microsoft
  const mAccess  = decryptSafe(settings?.ms_access_token)
  const mRefresh = decryptSafe(settings?.ms_refresh_token)
  if (mAccess && mRefresh && emails.length > 0) {
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
          } as OrgSettingsUpdate).eq('org_id', interview.org_id)
        }
        const busyMap = await queryMSFreeBusy(access_token, emails, timeMin, timeMax, timezone)
        for (const [email, slots] of Object.entries(busyMap)) mergeBusy(email, slots)
      } catch (e) { logger.error('[schedule] Microsoft query failed', e) }
    })())
  }

  // Zoom
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
          } as OrgSettingsUpdate).eq('org_id', interview.org_id)
        }
        const zoomEmail = (settings?.zoom_connected_email as string | null)?.toLowerCase()
        if (zoomEmail && emails.includes(zoomEmail)) {
          const slots = await queryZoomBusy(access_token, timeMin, timeMax)
          mergeBusy(zoomEmail, slots)
        }
      } catch (e) { logger.error('[schedule] Zoom query failed', e) }
    })())
  }

  await Promise.all(queries)

  return NextResponse.json({
    interview: {
      id:               interview.id,
      token,
      interviewer_name: interview.interviewer_name,
      interview_type:   interview.interview_type,
      duration_minutes: interview.duration_minutes,
      meeting_platform: interview.meeting_platform,
      status:           interview.status,
      scheduled_at:     interview.status === 'scheduled' && interview.calendar_event_id ? interview.scheduled_at : null,
      expires_at:       interview.self_schedule_expires_at,
      panel:            panelMembers,
    },
    position_title: (interview.hiring_request as any)?.position_title ?? null,
    candidate_name: (interview.candidate as any)?.name ?? null,
    busy_slots:     allBusy,
    week: {
      start: weekStart.toISOString(),
      end:   weekEnd.toISOString(),
      offset: weekOffset,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
