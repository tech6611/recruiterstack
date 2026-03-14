import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { getValidAccessToken, createMeetEvent } from '@/lib/google/calendar'
import { notifyInterviewScheduled } from '@/lib/notifications/interview'

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
    location, notes, generate_self_schedule,
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

  // ── Google Meet: create calendar event if org has Google connected ─────────
  let resolvedLocation  = location?.trim() || null
  let calendar_event_id: string | null = null
  let meetLink:          string | null = null
  let googleMeetError:   string | null = null

  if (interview_type === 'video' || interview_type === 'panel' || interview_type === 'technical') {
    try {
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email')
        .eq('org_id', orgId)
        .single()

      if (
        orgSettings?.google_oauth_access_token &&
        orgSettings?.google_oauth_refresh_token
      ) {
        const { access_token, tokens: freshTokens } = await getValidAccessToken({
          access_token:  orgSettings.google_oauth_access_token,
          refresh_token: orgSettings.google_oauth_refresh_token,
          token_expiry:  orgSettings.google_oauth_token_expiry ?? null,
        })

        // Persist refreshed tokens if they changed
        if (freshTokens.access_token !== orgSettings.google_oauth_access_token) {
          await supabase
            .from('org_settings')
            .update({
              google_oauth_access_token:  freshTokens.access_token,
              google_oauth_token_expiry:  freshTokens.token_expiry,
            })
            .eq('org_id', orgId)
        }

        // Fetch candidate email for the attendees list
        const { data: candidate } = await supabase
          .from('candidates')
          .select('name, email')
          .eq('id', candidate_id)
          .single()

        const { data: hiringReq } = await supabase
          .from('hiring_requests')
          .select('position_title')
          .eq('id', hiring_request_id)
          .single()

        const attendees: string[] = []
        if (candidate?.email)     attendees.push(candidate.email)
        if (interviewer_email?.trim()) attendees.push(interviewer_email.trim())

        const created = await createMeetEvent(access_token, {
          summary:          `Interview: ${candidate?.name ?? 'Candidate'} — ${hiringReq?.position_title ?? 'Position'}`,
          description:      notes?.trim() || undefined,
          start_at:         scheduled_at,
          duration_minutes: duration_minutes ?? 60,
          organizer_email:  orgSettings.google_connected_email ?? '',
          attendees,
        })

        calendar_event_id = created.calendar_event_id
        meetLink          = created.meet_link
        // Use meet link as location if no manual location was set
        if (!resolvedLocation && created.meet_link) {
          resolvedLocation = created.meet_link
        }
      }
    } catch (e) {
      // Non-fatal: log and continue without a Meet link
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[interviews] Google Meet creation failed:', msg)
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
        scheduledAt:      scheduled_at,
        durationMinutes:  duration_minutes ?? 60,
        interviewType:    interview_type ?? 'video',
        location:         resolvedLocation,
        meetLink:         meetLink,
        recruiterName:    'RecruiterStack',
        recruiterEmail:   process.env.SENDGRID_FROM_EMAIL ?? '',
      })
    } catch (e) {
      console.error('[interviews] notification dispatch failed:', e)
    }
  })()

  return NextResponse.json({ data: { ...data, meet_link: meetLink, google_meet_error: googleMeetError } }, { status: 201 })
}
