/**
 * POST /api/agent/schedule-interview
 *
 * Atomic, agent-callable endpoint for scheduling interviews.
 * Designed to be invoked by the RecruiterStack co-pilot without human-in-the-loop
 * for each individual step.
 *
 * What it does in one call:
 *   1. Validates all inputs
 *   2. Looks up candidate + hiring request context
 *   3. (Optional) Checks interviewer availability via Google Calendar free/busy
 *   4. Creates a Google Calendar event with a Google Meet link (if org connected)
 *   5. Inserts the interview record into the DB
 *   6. Logs the application_event
 *   7. Fires email notifications (candidate + interviewer) and Slack notifications
 *   8. Returns a rich confirmation payload the agent can present to the recruiter
 *
 * Auth: same requireOrg() check as regular API routes.
 *       For automated agent flows, pass an API key via Authorization: Bearer <key>
 *       (future: validate against an agent_tokens table).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { getValidAccessToken, createMeetEvent, queryFreeBusy } from '@/lib/google/calendar'
import { notifyInterviewScheduled } from '@/lib/notifications/interview'

interface ScheduleInterviewBody {
  // Required
  application_id:    string
  candidate_id:      string
  hiring_request_id: string
  interviewer_name:  string
  scheduled_at:      string   // ISO UTC datetime

  // Optional
  stage_id?:            string
  interviewer_email?:   string
  interview_type?:      'video' | 'phone' | 'in_person' | 'panel' | 'technical' | 'assessment'
  duration_minutes?:    number
  location?:            string
  notes?:               string
  generate_self_schedule?: boolean
  check_availability?:  boolean  // If true, check free/busy before scheduling
  timezone?:            string   // IANA timezone for calendar events
}

export async function POST(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: ScheduleInterviewBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    application_id,
    candidate_id,
    hiring_request_id,
    interviewer_name,
    scheduled_at,
    stage_id,
    interviewer_email,
    interview_type       = 'video',
    duration_minutes     = 60,
    location,
    notes,
    generate_self_schedule = false,
    check_availability   = false,
    timezone             = 'UTC',
  } = body

  // ── Validate required fields ─────────────────────────────────────────────
  if (!application_id || !candidate_id || !hiring_request_id || !interviewer_name?.trim() || !scheduled_at) {
    return NextResponse.json(
      {
        error: 'Missing required fields: application_id, candidate_id, hiring_request_id, interviewer_name, scheduled_at',
        required_fields: ['application_id', 'candidate_id', 'hiring_request_id', 'interviewer_name', 'scheduled_at'],
      },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // ── Fetch candidate + hiring request context ─────────────────────────────
  const [candidateRes, hiringReqRes] = await Promise.all([
    supabase.from('candidates').select('name, email, current_title, location').eq('id', candidate_id).single(),
    supabase.from('hiring_requests').select('position_title, ticket_number').eq('id', hiring_request_id).single(),
  ])

  if (!candidateRes.data) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }
  if (!hiringReqRes.data) {
    return NextResponse.json({ error: 'Hiring request not found' }, { status: 404 })
  }

  const candidate  = candidateRes.data
  const hiringReq  = hiringReqRes.data

  // ── Fetch org settings (Google tokens, Slack config) ─────────────────────
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email')
    .eq('org_id', orgId)
    .single()

  const googleConnected =
    !!(orgSettings?.google_oauth_access_token && orgSettings?.google_oauth_refresh_token)

  // ── Availability check (optional) ────────────────────────────────────────
  const availabilityConflicts: { email: string; conflicts: { start: string; end: string }[] }[] = []

  if (check_availability && googleConnected && interviewer_email?.trim()) {
    try {
      const { access_token } = await getValidAccessToken({
        access_token:  orgSettings!.google_oauth_access_token!,
        refresh_token: orgSettings!.google_oauth_refresh_token!,
        token_expiry:  orgSettings!.google_oauth_token_expiry ?? null,
      })

      const interviewEnd = new Date(
        new Date(scheduled_at).getTime() + duration_minutes * 60 * 1000
      ).toISOString()

      const busyMap = await queryFreeBusy(
        access_token,
        [interviewer_email.trim()],
        scheduled_at,
        interviewEnd,
        timezone
      )

      for (const [email, slots] of Object.entries(busyMap)) {
        if (slots.length > 0) {
          availabilityConflicts.push({ email, conflicts: slots })
        }
      }
    } catch (e) {
      console.error('[agent-schedule] availability check failed (non-fatal):', e)
    }
  }

  // ── Google Meet event creation ────────────────────────────────────────────
  let resolvedLocation  = location?.trim() || null
  let calendar_event_id: string | null = null
  let meetLink:          string | null = null
  let calendarError:     string | null = null

  if (
    googleConnected &&
    ['video', 'panel', 'technical'].includes(interview_type)
  ) {
    try {
      const { access_token, tokens: freshTokens } = await getValidAccessToken({
        access_token:  orgSettings!.google_oauth_access_token!,
        refresh_token: orgSettings!.google_oauth_refresh_token!,
        token_expiry:  orgSettings!.google_oauth_token_expiry ?? null,
      })

      if (freshTokens.access_token !== orgSettings!.google_oauth_access_token) {
        await supabase
          .from('org_settings')
          .update({
            google_oauth_access_token: freshTokens.access_token,
            google_oauth_token_expiry: freshTokens.token_expiry,
          })
          .eq('org_id', orgId)
      }

      const attendees: string[] = []
      if (candidate.email)             attendees.push(candidate.email)
      if (interviewer_email?.trim())   attendees.push(interviewer_email.trim())

      const created = await createMeetEvent(access_token, {
        summary:          `Interview: ${candidate.name} — ${hiringReq.position_title}`,
        description:      notes?.trim() || `Interview scheduled via RecruiterStack`,
        start_at:         scheduled_at,
        duration_minutes,
        organizer_email:  orgSettings!.google_connected_email ?? '',
        attendees,
        timezone,
      })

      calendar_event_id = created.calendar_event_id
      meetLink          = created.meet_link
      if (!resolvedLocation && created.meet_link) {
        resolvedLocation = created.meet_link
      }
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e)
      console.error('[agent-schedule] Google Meet creation failed:', e)
    }
  }

  // ── Self-schedule token ───────────────────────────────────────────────────
  const self_schedule_token = generate_self_schedule ? randomBytes(20).toString('hex') : null
  const expires = new Date()
  expires.setDate(expires.getDate() + 7)
  const self_schedule_expires_at = generate_self_schedule ? expires.toISOString() : null

  // ── Insert interview ──────────────────────────────────────────────────────
  const { data: interview, error: insertError } = await supabase
    .from('interviews')
    .insert({
      org_id:                  orgId,
      application_id,
      candidate_id,
      hiring_request_id,
      stage_id:                stage_id ?? null,
      interviewer_name:        interviewer_name.trim(),
      interviewer_email:       interviewer_email?.trim() || null,
      interview_type,
      scheduled_at,
      duration_minutes,
      location:                resolvedLocation,
      notes:                   notes?.trim() || null,
      status:                  'scheduled',
      self_schedule_token,
      self_schedule_expires_at,
      calendar_event_id,
    } as any)
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // ── Application event log ─────────────────────────────────────────────────
  await supabase.from('application_events').insert({
    application_id,
    org_id:       orgId,
    event_type:   'interview_scheduled',
    note:         `[Agent] Interview scheduled with ${interviewer_name.trim()} — ${new Date(scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metadata:     {
      interview_id:     (interview as any).id,
      interview_type,
      duration_minutes,
      calendar_event_id,
      meet_link:        meetLink,
      agent_scheduled:  true,
    },
    created_by:   orgId,
  } as any)

  // ── Notifications (non-blocking) ─────────────────────────────────────────
  ;(async () => {
    try {
      await notifyInterviewScheduled({
        orgId,
        candidateName:    candidate.name,
        candidateEmail:   candidate.email ?? '',
        interviewerName:  interviewer_name.trim(),
        interviewerEmail: interviewer_email?.trim() || null,
        positionTitle:    hiringReq.position_title,
        scheduledAt:      scheduled_at,
        durationMinutes:  duration_minutes,
        interviewType:    interview_type,
        location:         resolvedLocation,
        meetLink,
        notes:            null,
        recruiterName:    'RecruiterStack',
        recruiterEmail:   process.env.SENDGRID_FROM_EMAIL ?? '',
      })
    } catch (e) {
      console.error('[agent-schedule] notification dispatch failed:', e)
    }
  })()

  // ── Rich confirmation response ────────────────────────────────────────────
  return NextResponse.json(
    {
      success: true,
      interview: {
        id:                interview ? (interview as any).id : null,
        scheduled_at,
        duration_minutes,
        interview_type,
        meet_link:         meetLink,
        location:          resolvedLocation,
        calendar_event_id,
        self_schedule_token,
      },
      candidate: {
        id:    candidate_id,
        name:  candidate.name,
        email: candidate.email,
      },
      interviewer: {
        name:  interviewer_name.trim(),
        email: interviewer_email?.trim() || null,
      },
      position: {
        title:         hiringReq.position_title,
        ticket_number: hiringReq.ticket_number,
      },
      integrations: {
        google_calendar: googleConnected
          ? calendar_event_id
            ? 'event_created'
            : `failed: ${calendarError}`
          : 'not_connected',
        notifications_sent: true,
      },
      ...(availabilityConflicts.length > 0 && {
        availability_warning: {
          message:   'One or more attendees have conflicts during this time slot.',
          conflicts: availabilityConflicts,
        },
      }),
    },
    { status: 201 }
  )
}
