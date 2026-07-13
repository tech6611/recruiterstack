import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getValidAccessToken as getGoogleToken, createMeetEvent } from '@/lib/google/calendar'
import { getValidAccessToken as getMSToken, createTeamsMeeting } from '@/lib/microsoft/calendar'
import { getValidAccessToken as getZoomToken, createZoomMeeting } from '@/lib/zoom/meetings'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { cancelCalendarEvent } from '@/lib/integrations/cancel-event'
import { scheduleInterviewReminders } from '@/lib/interviews/reminders'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'
import type { OrgSettingsUpdate, InterviewUpdate, ApplicationEventInsert } from '@/lib/types/database'

// POST /api/schedule/[token]/confirm — public, no auth
// Body: { scheduled_at: ISO string, timezone: string, reschedule?: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const supabase = createAdminClient()

  let body: { scheduled_at: string; timezone?: string; reschedule?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { scheduled_at, timezone = 'UTC', reschedule = false } = body
  if (!scheduled_at) {
    return NextResponse.json({ error: 'scheduled_at is required' }, { status: 400 })
  }

  // Fetch interview
  const { data: interview, error } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), application:applications(job:jobs(position_title:title))')
    .eq('self_schedule_token', token)
    .single() as { data: any; error: any }

  if (error || !interview) {
    return NextResponse.json({ error: 'Invalid scheduling link' }, { status: 404 })
  }

  if (interview.self_schedule_expires_at && new Date(interview.self_schedule_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This scheduling link has expired' }, { status: 410 })
  }

  if (interview.status === 'cancelled') {
    return NextResponse.json({ error: 'This interview has been cancelled' }, { status: 410 })
  }

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL!
  const orgId    = interview.org_id
  const candidateEmail = (interview.candidate as any)?.email ?? null
  const candidateName  = (interview.candidate as any)?.name  ?? 'Candidate'
  const positionTitle  = (interview.application as any)?.job?.position_title ?? 'Position'
  const panelMembers: { name: string; email: string }[] = interview.panel ?? []
  const panelEmails = panelMembers.map((m: any) => m.email?.trim()).filter(Boolean)

  // All attendees: candidate + all panel members
  const attendeeEmails: string[] = []
  if (candidateEmail) attendeeEmails.push(candidateEmail)
  for (const e of panelEmails) {
    if (!attendeeEmails.includes(e)) attendeeEmails.push(e)
  }

  const rescheduleUrl = `${appUrl}/schedule/${token}?reschedule=1`
  const eventSummary  = `Interview: ${candidateName} — ${positionTitle}`
  const eventDesc     = `Interview with ${interview.interviewer_name} for ${positionTitle}.\n\nNeed to reschedule? Visit: ${rescheduleUrl}`

  // Load org credentials
  const { data: settings } = await supabase
    .from('org_settings')
    .select(
      'google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email, ' +
      'zoom_access_token, zoom_refresh_token, zoom_token_expiry, ' +
      'ms_access_token, ms_refresh_token, ms_token_expiry'
    )
    .eq('org_id', orgId)
    .single() as { data: any; error: any }

  let meetLink:           string | null = null
  let newCalendarEventId: string | null = null
  let resolvedPlatform:   string | null = interview.meeting_platform ?? null

  // Cancel old calendar event if rescheduling. Uses the shared host-resolver
  // helper, so it removes Google/Teams/Zoom events on whichever calendar the
  // event actually lives on (per-user host, or the legacy org account).
  if (reschedule && interview.calendar_event_id && interview.meeting_platform) {
    const oldPanelEmails = panelEmails.length
      ? panelEmails
      : (interview.interviewer_email ? [interview.interviewer_email] : [])
    await cancelCalendarEvent({
      meetingPlatform: interview.meeting_platform,
      calendarEventId: interview.calendar_event_id,
      panelEmails:     oldPanelEmails,
      orgId,
    })
  }

  // Create new calendar event
  const platform = resolvedPlatform ?? 'google_meet'

  if (platform === 'ms_teams') {
    const mAccess  = decryptSafe(settings?.ms_access_token)
    const mRefresh = decryptSafe(settings?.ms_refresh_token)
    if (mAccess && mRefresh) {
      try {
        const { access_token, tokens: fresh } = await getMSToken({
          access_token: mAccess, refresh_token: mRefresh,
          token_expiry: settings?.ms_token_expiry ?? null,
        })
        if (fresh.access_token !== mAccess) {
          await supabase.from('org_settings').update({
            ms_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
            ms_token_expiry: fresh.token_expiry,
          } as OrgSettingsUpdate).eq('org_id', orgId)
        }
        const created = await createTeamsMeeting(access_token, {
          summary:          eventSummary,
          description:      eventDesc,
          start_at:         scheduled_at,
          duration_minutes: interview.duration_minutes ?? 60,
          attendees:        attendeeEmails,
          timezone,
        })
        newCalendarEventId = created.event_id
        meetLink         = created.teams_link
        resolvedPlatform = 'ms_teams'
      } catch (e) { logger.error('[schedule/confirm] Teams creation failed', e) }
    }

  } else if (platform === 'zoom') {
    const zAccess  = decryptSafe(settings?.zoom_access_token)
    const zRefresh = decryptSafe(settings?.zoom_refresh_token)
    if (zAccess && zRefresh) {
      try {
        const { access_token, tokens: fresh } = await getZoomToken({
          access_token: zAccess, refresh_token: zRefresh,
          token_expiry: settings?.zoom_token_expiry ?? null,
        })
        if (fresh.access_token !== zAccess) {
          await supabase.from('org_settings').update({
            zoom_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
            zoom_refresh_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.refresh_token) : fresh.refresh_token,
            zoom_token_expiry: fresh.token_expiry,
          } as OrgSettingsUpdate).eq('org_id', orgId)
        }
        const created = await createZoomMeeting(access_token, {
          topic:      eventSummary,
          start_time: scheduled_at,
          duration:   interview.duration_minutes ?? 60,
          timezone,
        })
        newCalendarEventId = created.meeting_id
        meetLink         = created.join_url
        resolvedPlatform = 'zoom'
      } catch (e) { logger.error('[schedule/confirm] Zoom creation failed', e) }
    }

  } else {
    // Google Meet (default)
    const gAccess  = decryptSafe(settings?.google_oauth_access_token)
    const gRefresh = decryptSafe(settings?.google_oauth_refresh_token)
    if (gAccess && gRefresh) {
      try {
        const { access_token, tokens: fresh } = await getGoogleToken({
          access_token: gAccess, refresh_token: gRefresh,
          token_expiry: settings?.google_oauth_token_expiry ?? null,
        })
        if (fresh.access_token !== gAccess) {
          await supabase.from('org_settings').update({
            google_oauth_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
            google_oauth_token_expiry: fresh.token_expiry,
          } as OrgSettingsUpdate).eq('org_id', orgId)
        }
        const created = await createMeetEvent(access_token, {
          summary:          eventSummary,
          description:      eventDesc,
          start_at:         scheduled_at,
          duration_minutes: interview.duration_minutes ?? 60,
          organizer_email:  settings?.google_connected_email ?? '',
          attendees:        attendeeEmails,
          timezone,
        })
        newCalendarEventId = created.calendar_event_id
        meetLink         = created.meet_link
        resolvedPlatform = 'google_meet'
      } catch (e) { logger.error('[schedule/confirm] Google Meet creation failed', e) }
    }
  }

  // Update interview row. Persist the NEW calendar event id + platform so a
  // later cancel/reschedule targets the current event, not the one we just
  // deleted above.
  const { error: updateError } = await supabase
    .from('interviews')
    .update({
      scheduled_at,
      status:            'scheduled',
      location:          meetLink ?? interview.location,
      calendar_event_id: newCalendarEventId ?? interview.calendar_event_id,
      meeting_platform:  resolvedPlatform ?? interview.meeting_platform,
      updated_at:        new Date().toISOString(),
    } as InterviewUpdate)
    .eq('self_schedule_token', token)

  if (updateError) {
    logger.error('[schedule/confirm] DB update failed', updateError)
    return NextResponse.json({ error: 'Failed to save your booking. Please try again.' }, { status: 500 })
  }

  // Schedule (or re-schedule) 24h + 1h reminders for the chosen time. Stale
  // reminders from a previous time are dropped by the handler's freshness check.
  await scheduleInterviewReminders({
    orgId,
    interviewId: interview.id,
    scheduledAt: scheduled_at,
    timezone,
  })

  emitWebhook(orgId, reschedule ? 'interview.rescheduled' : 'interview.scheduled', {
    interview_id:      interview.id,
    application_id:    interview.application_id,
    candidate_id:      interview.candidate_id,
    hiring_request_id: interview.hiring_request_id,
    scheduled_at,
    meeting_platform:  resolvedPlatform,
    self_scheduled:    true,
  }).catch(e => logger.error('[schedule/confirm] webhook emit failed', e))

  // Log application event
  await supabase.from('application_events').insert({
    application_id: interview.application_id,
    org_id:         orgId,
    event_type:     'interview_scheduled',
    note:           reschedule
      ? `Interview rescheduled by candidate to ${new Date(scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : `Candidate self-scheduled interview for ${new Date(scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metadata:       { interview_id: interview.id, self_scheduled: true, reschedule },
    created_by:     orgId,
  } as ApplicationEventInsert)

  return NextResponse.json({
    success:          true,
    scheduled_at,
    meet_link:        meetLink,
    meeting_platform: resolvedPlatform,
    reschedule_url:   rescheduleUrl,
    interviewer_name: interview.interviewer_name,
    duration_minutes: interview.duration_minutes,
    position_title:   positionTitle,
    candidate_name:   candidateName,
  })
}
