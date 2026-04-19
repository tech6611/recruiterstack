import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { createMeetEvent } from '@/lib/google/calendar'
import { createZoomMeeting } from '@/lib/zoom/meetings'
import { createTeamsMeeting } from '@/lib/microsoft/calendar'
import { resolveHost, HostTokenUnavailableError, type ResolvableProvider } from '@/lib/integrations/host-resolver'
import { notifyInterviewScheduled } from '@/lib/notifications/interview'
import { logger } from '@/lib/logger'
import type { InterviewInsert, ApplicationEventInsert } from '@/lib/types/database'

interface PanelMember { name?: string; email: string }

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
    location, notes, generate_self_schedule, timezone, meeting_platform, panel, host_email,
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
    // Fetch candidate + hiring request info (needed for event summary)
    const [{ data: candidateRaw }, { data: hiringReqRaw }] = await Promise.all([
      supabase.from('candidates').select('name, email').eq('id', candidate_id).single(),
      supabase.from('hiring_requests').select('position_title').eq('id', hiring_request_id).single(),
    ])
    const candidate = candidateRaw as { name: string; email: string } | null
    const hiringReq = hiringReqRaw as { position_title: string } | null

    const attendeeEmails: string[] = []
    if (candidate?.email)          attendeeEmails.push(candidate.email)
    if (interviewer_email?.trim()) attendeeEmails.push(interviewer_email.trim())

    const eventSummary = `Interview: ${candidate?.name ?? 'Candidate'} — ${hiringReq?.position_title ?? 'Position'}`
    const eventDesc    = notes?.trim() ? stripHtml(notes) : undefined

    // Panel emails drive the host-fallback chain (first panelist with a working
    // token hosts the event). Fall back to org-level tokens if no panelist has
    // connected this provider per-user yet. If the caller specified a preferred
    // host_email, pull it to the front of the chain.
    const rawPanelEmails: string[] = Array.isArray(panel)
      ? (panel as PanelMember[]).map(m => m.email).filter(Boolean)
      : interviewer_email?.trim() ? [interviewer_email.trim()] : []

    const normalize = (s: string) => s.trim().toLowerCase()
    const preferred = typeof host_email === 'string' ? normalize(host_email) : null
    const panelEmails: string[] = preferred
      ? [
          ...rawPanelEmails.filter(e => normalize(e) === preferred),
          ...rawPanelEmails.filter(e => normalize(e) !== preferred),
        ]
      : rawPanelEmails

    const provider: ResolvableProvider =
      resolvedPlatform === 'zoom'     ? 'zoom' :
      resolvedPlatform === 'ms_teams' ? 'microsoft' :
      'google'
    // Normalize platform name for DB (google → google_meet)
    if (provider === 'google') resolvedPlatform = 'google_meet'

    try {
      const host = await resolveHost(provider, panelEmails, orgId)

      if (provider === 'zoom') {
        const created = await createZoomMeeting(host.access_token, {
          topic:      eventSummary,
          start_time: scheduled_at,
          duration:   duration_minutes ?? 60,
          timezone:   timezone ?? 'UTC',
        })
        calendar_event_id = created.meeting_id
        meetLink          = created.join_url
        if (!resolvedLocation) resolvedLocation = created.join_url
      } else if (provider === 'microsoft') {
        const created = await createTeamsMeeting(host.access_token, {
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
      } else {
        const created = await createMeetEvent(host.access_token, {
          summary:          eventSummary,
          description:      eventDesc,
          start_at:         scheduled_at,
          duration_minutes: duration_minutes ?? 60,
          organizer_email:  host.connected_email ?? '',
          attendees:        attendeeEmails,
          timezone:         timezone ?? 'UTC',
        })
        calendar_event_id = created.calendar_event_id
        meetLink          = created.meet_link
        if (!resolvedLocation && created.meet_link) resolvedLocation = created.meet_link
      }

      if (host.via === 'user_integrations') {
        logger.info('[interviews] meeting hosted on user calendar', {
          provider, host_user_id: host.host_user_id,
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (e instanceof HostTokenUnavailableError) {
        logger.warn('[interviews] no host token available; proceeding without calendar event', {
          provider, orgId,
        })
      } else {
        logger.error(`[interviews] ${provider} meeting creation failed`, undefined, { error: msg })
      }
      googleMeetError = msg
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
    } as unknown as InterviewInsert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const interviewData = data as Record<string, unknown>

  // ── Log application event ────────────────────────────────────────────────
  await supabase.from('application_events').insert({
    application_id,
    event_type:   'interview_scheduled',
    from_stage:   null,
    to_stage:     null,
    note:         `Interview scheduled with ${interviewer_name.trim()} — ${new Date(scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metadata:     { interview_id: interviewData.id, interview_type: interview_type ?? 'video', duration_minutes: duration_minutes ?? 60 },
    created_by:   orgId,
  } as unknown as ApplicationEventInsert)

  // ── Fire notifications (non-blocking) ────────────────────────────────────
  // Fetch recruiter + candidate info for notification copy
  ;(async () => {
    try {
      const [candidateRes2, hiringReqRes2] = await Promise.all([
        supabase.from('candidates').select('name, email').eq('id', candidate_id).single(),
        supabase.from('hiring_requests').select('position_title').eq('id', hiring_request_id).single(),
      ])
      const candData = candidateRes2.data as { name: string; email: string } | null
      const hrData = hiringReqRes2.data as { position_title: string } | null

      await notifyInterviewScheduled({
        orgId,
        candidateName:    candData?.name ?? 'Candidate',
        candidateEmail:   candData?.email ?? '',
        interviewerName:  interviewer_name.trim(),
        interviewerEmail: interviewer_email?.trim() || null,
        positionTitle:    hrData?.position_title ?? 'Position',
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
  return NextResponse.json({ data: { ...interviewData, meet_link: meetLink, meeting_link: meetLink, meeting_platform: resolvedPlatform, google_meet_error: googleMeetError, self_schedule_link: selfScheduleLink } }, { status: 201 })
}
