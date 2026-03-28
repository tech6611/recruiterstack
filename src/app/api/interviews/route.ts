import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { getValidAccessToken as getGoogleToken, createMeetEvent } from '@/lib/google/calendar'
import { getValidAccessToken as getZoomToken, createZoomMeeting } from '@/lib/zoom/meetings'
import { getValidAccessToken as getMSToken, createTeamsMeeting } from '@/lib/microsoft/calendar'
import { notifyInterviewScheduled } from '@/lib/notifications/interview'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

// Strip HTML tags → plain text (for Google Calendar event descriptions)
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\n{3,}/g, '\n\n').trim()
}

export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { searchParams } = req.nextUrl
  const application_id      = searchParams.get('application_id')
  const candidate_id        = searchParams.get('candidate_id')
  const hiring_request_id   = searchParams.get('hiring_request_id')
  const upcoming            = searchParams.get('upcoming') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title, ticket_number)')
    .eq('org_id', orgId)

  if (application_id)    q = q.eq('application_id', application_id)
  if (candidate_id)      q = q.eq('candidate_id', candidate_id)
  if (hiring_request_id) q = q.eq('hiring_request_id', hiring_request_id)
  if (upcoming)          q = q.gte('scheduled_at', new Date().toISOString()).eq('status', 'scheduled')

  const { data, error } = await q.order('scheduled_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const body = await req.json()
  const {
    application_id, candidate_id, hiring_request_id, stage_id,
    interviewer_name, interviewer_email, interview_type, scheduled_at, duration_minutes,
    location, notes, generate_self_schedule, timezone, meeting_platform, panel,
  } = body

  if (!application_id || !candidate_id || !hiring_request_id || !interviewer_name?.trim() || !scheduled_at) {
    return NextResponse.json(
      { error: 'application_id, candidate_id, hiring_request_id, interviewer_name, and scheduled_at are required' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // Generate self-schedule token if requested
  const self_schedule_token   = generate_self_schedule ? randomBytes(20).toString('hex') : null
  const expires = new Date()
  expires.setDate(expires.getDate() + 7)
  const self_schedule_expires_at = generate_self_schedule ? expires.toISOString() : null

  // ── Meeting creation: branch by selected platform ──────────────────────────
  let resolvedLocation    = location?.trim() || null
  let calendar_event_id:  string | null = null
  let meetLink:           string | null = null
  let googleMeetError:    string | null = null
  let resolvedPlatform:   string | null = meeting_platform ?? null

  if (interview_type === 'video' || interview_type === 'panel' || interview_type === 'technical') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select(
        'google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email, ' +
        'zoom_access_token, zoom_refresh_token, zoom_token_expiry, zoom_connected_email, ' +
        'ms_access_token, ms_refresh_token, ms_token_expiry, ms_connected_email'
      )
      .eq('org_id', orgId)
      .single() as { data: any; error: any }

    // Fetch candidate + hiring request info (needed for event summary)
    const [{ data: candidate }, { data: hiringReq }] = await Promise.all([
      supabase.from('candidates').select('name, email').eq('id', candidate_id).single(),
      supabase.from('hiring_requests').select('position_title').eq('id', hiring_request_id).single(),
    ])

    const attendeeEmails: string[] = []
    if (candidate?.email)          attendeeEmails.push(candidate.email)
    if (interviewer_email?.trim()) attendeeEmails.push(interviewer_email.trim())

    const eventSummary = `Interview: ${candidate?.name ?? 'Candidate'} — ${hiringReq?.position_title ?? 'Position'}`
    const eventDesc    = notes?.trim() ? stripHtml(notes) : undefined

    // ── Zoom ──────────────────────────────────────────────────────────────
    if (resolvedPlatform === 'zoom') {
      const zAccess  = decryptSafe(orgSettings?.zoom_access_token)
      const zRefresh = decryptSafe(orgSettings?.zoom_refresh_token)
      if (zAccess && zRefresh) {
        try {
          const { access_token, tokens: fresh } = await getZoomToken({
            access_token: zAccess, refresh_token: zRefresh,
            token_expiry: orgSettings!.zoom_token_expiry ?? null,
          })
          if (fresh.access_token !== zAccess) {
            await supabase.from('org_settings').update({
              zoom_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
              zoom_refresh_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.refresh_token) : fresh.refresh_token,
              zoom_token_expiry: fresh.token_expiry,
            }).eq('org_id', orgId)
          }
          const created = await createZoomMeeting(access_token, {
            topic:      eventSummary,
            start_time: scheduled_at,
            duration:   duration_minutes ?? 60,
            timezone:   timezone ?? 'UTC',
          })
          calendar_event_id = created.meeting_id
          meetLink          = created.join_url
          if (!resolvedLocation) resolvedLocation = created.join_url
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          logger.error('[interviews] Zoom meeting creation failed', undefined, { error: msg })
          googleMeetError = msg
        }
      }

    // ── Microsoft Teams ───────────────────────────────────────────────────
    } else if (resolvedPlatform === 'ms_teams') {
      const mAccess  = decryptSafe(orgSettings?.ms_access_token)
      const mRefresh = decryptSafe(orgSettings?.ms_refresh_token)
      if (mAccess && mRefresh) {
        try {
          const { access_token, tokens: fresh } = await getMSToken({
            access_token: mAccess, refresh_token: mRefresh,
            token_expiry: orgSettings!.ms_token_expiry ?? null,
          })
          if (fresh.access_token !== mAccess) {
            await supabase.from('org_settings').update({
              ms_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
              ms_token_expiry: fresh.token_expiry,
            }).eq('org_id', orgId)
          }
          const created = await createTeamsMeeting(access_token, {
            summary:          eventSummary,
            description:      eventDesc,
            start_at:         scheduled_at,
            duration_minutes: duration_minutes ?? 60,
            attendees:        attendeeEmails,
            timezone:         timezone ?? 'UTC',
          })
          calendar_event_id = created.event_id
          meetLink          = created.teams_link
          if (!resolvedLocation) resolvedLocation = created.teams_link
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          logger.error('[interviews] Teams meeting creation failed', undefined, { error: msg })
          googleMeetError = msg
        }
      }

    // ── Google Meet (default) ─────────────────────────────────────────────
    } else {
      const gAccess  = decryptSafe(orgSettings?.google_oauth_access_token)
      const gRefresh = decryptSafe(orgSettings?.google_oauth_refresh_token)
      if (gAccess && gRefresh) {
        resolvedPlatform = 'google_meet'
        try {
          const { access_token, tokens: freshTokens } = await getGoogleToken({
            access_token:  gAccess,
            refresh_token: gRefresh,
            token_expiry:  orgSettings!.google_oauth_token_expiry ?? null,
          })
          if (freshTokens.access_token !== gAccess) {
            await supabase.from('org_settings').update({
              google_oauth_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(freshTokens.access_token) : freshTokens.access_token,
              google_oauth_token_expiry: freshTokens.token_expiry,
            }).eq('org_id', orgId)
          }
          const created = await createMeetEvent(access_token, {
            summary:          eventSummary,
            description:      eventDesc,
            start_at:         scheduled_at,
            duration_minutes: duration_minutes ?? 60,
            organizer_email:  orgSettings?.google_connected_email ?? '',
            attendees:        attendeeEmails,
            timezone:         timezone ?? 'UTC',
          })
          calendar_event_id = created.calendar_event_id
          meetLink          = created.meet_link
          if (!resolvedLocation && created.meet_link) resolvedLocation = created.meet_link
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          logger.error('[interviews] Google Meet creation failed', undefined, { error: msg })
          googleMeetError = msg
        }
      }
    }
  }

  // ── Insert interview row ─────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('interviews')
    .insert({
      org_id:            orgId,
      application_id,
      candidate_id,
      hiring_request_id,
      stage_id:          stage_id ?? null,
      interviewer_name:  interviewer_name.trim(),
      interviewer_email: interviewer_email?.trim() || null,
      interview_type:    interview_type ?? 'video',
      scheduled_at,
      duration_minutes:  duration_minutes ?? 60,
      location:          resolvedLocation,
      notes:             notes?.trim() || null,
      status:            'scheduled',
      self_schedule_token,
      self_schedule_expires_at,
      calendar_event_id,
      meeting_platform: resolvedPlatform,
      panel:            panel ?? null,
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Log application event ────────────────────────────────────────────────
  await supabase.from('application_events').insert({
    application_id,
    org_id:       orgId,
    event_type:   'interview_scheduled',
    note:         `Interview scheduled with ${interviewer_name.trim()} — ${new Date(scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metadata:     { interview_id: (data as any).id, interview_type: interview_type ?? 'video', duration_minutes: duration_minutes ?? 60 },
    created_by:   orgId,
  } as any)

  // ── Fire notifications (non-blocking) ────────────────────────────────────
  // Fetch recruiter + candidate info for notification copy
  ;(async () => {
    try {
      const [candidateRes, hiringReqRes] = await Promise.all([
        supabase.from('candidates').select('name, email').eq('id', candidate_id).single(),
        supabase.from('hiring_requests').select('position_title').eq('id', hiring_request_id).single(),
      ])

      await notifyInterviewScheduled({
        orgId,
        candidateName:    candidateRes.data?.name ?? 'Candidate',
        candidateEmail:   candidateRes.data?.email ?? '',
        interviewerName:  interviewer_name.trim(),
        interviewerEmail: interviewer_email?.trim() || null,
        positionTitle:    hiringReqRes.data?.position_title ?? 'Position',
        scheduledAt:         scheduled_at,
        durationMinutes:     duration_minutes ?? 60,
        timezone:            timezone ?? null,
        interviewType:       interview_type ?? 'video',
        location:            resolvedLocation,
        meetLink:            meetLink,
        notes:               notes?.trim() || null,
        calendarInviteSent:  false,  // GCal invite emails suppressed; SendGrid always fires
        recruiterName:       'RecruiterStack',
        recruiterEmail:      process.env.SENDGRID_FROM_EMAIL ?? '',
      })
    } catch (e) {
      logger.error('[interviews] notification dispatch failed', e)
    }
  })()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const selfScheduleLink = self_schedule_token ? `${appUrl}/schedule/${self_schedule_token}` : null
  return NextResponse.json({ data: { ...data, meet_link: meetLink, meeting_link: meetLink, meeting_platform: resolvedPlatform, google_meet_error: googleMeetError, self_schedule_link: selfScheduleLink } }, { status: 201 })
}
