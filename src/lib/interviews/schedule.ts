/**
 * Schedule an interview — the single implementation behind the Interviews
 * screen (POST /api/interviews) and the copilot's schedule_interview tool.
 *
 * Creates the Google Meet / Zoom / Teams meeting on the first panelist's (or the
 * org's) connected calendar, saves the interview, logs the timeline event,
 * advances the candidate if a plan round is linked, emails the candidate and
 * interviewer (SendGrid), and — for a confirmed time — schedules 24h/1h
 * reminders and emits the interview.scheduled webhook.
 */

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMeetEvent } from '@/lib/google/calendar'
import { createZoomMeeting } from '@/lib/zoom/meetings'
import { createTeamsMeeting } from '@/lib/microsoft/calendar'
import { resolveHost, HostTokenUnavailableError, type ResolvableProvider } from '@/lib/integrations/host-resolver'
import { notifyInterviewScheduled } from '@/lib/notifications/interview'
import { scheduleInterviewReminders } from '@/lib/interviews/reminders'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'
import { getCanonicalCandidateJobContext } from '@/modules/ats/domain/job-pipelines'
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

export type ScheduleInterviewResult =
  | { ok: true; data: Record<string, unknown> & { meet_link: string | null; meeting_platform: string | null; google_meet_error: string | null; self_schedule_link: string | null } }
  | { ok: false; status: number; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function scheduleInterviewWithMeeting(supabase: SupabaseClient<any>, orgId: string, body: Record<string, any>): Promise<ScheduleInterviewResult> {
  const {
    application_id, candidate_id, hiring_request_id, stage_id,
    interviewer_name, interviewer_email, interview_type, scheduled_at, duration_minutes,
    location, notes, generate_self_schedule, timezone, meeting_platform, panel, host_email,
    plan_round_id,
  } = body

  if (!application_id || !candidate_id || !interviewer_name?.trim() || !scheduled_at) {
    return { ok: false, status: 400, error: 'application_id, candidate_id, interviewer_name, and scheduled_at are required' }
  }

  // Canonical apps have no legacy hiring_request (nullable since migration 067).
  // Django serializes those nulls as the string "None"; coerce such placeholders
  // to real null so the uuid columns don't reject them.
  const cleanUuid = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t && t !== 'None' && t !== 'null' && t !== 'undefined' ? t : null
  }
  const hiringRequestId = cleanUuid(hiring_request_id)
  const stageId         = cleanUuid(stage_id)

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
    const context = await getCanonicalCandidateJobContext(supabase, orgId, application_id)
    const candidate = context?.candidate ?? null
    const hiringReq = context?.job ?? null

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
      hiring_request_id: hiringRequestId,
      stage_id:          stageId,
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
      plan_round_id:    cleanUuid(plan_round_id),
    } as unknown as InterviewInsert)
    .select()
    .single()

  if (error) return { ok: false, status: 500, error: error.message }

  const interviewData = data as Record<string, unknown>

  // ── Log application event ────────────────────────────────────────────────
  await supabase.from('application_events').insert({
    application_id,
    org_id:       orgId,
    event_type:   'interview_scheduled',
    from_stage:   null,
    to_stage:     null,
    note:         `Interview scheduled with ${interviewer_name.trim()} — ${new Date(scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metadata:     { interview_id: interviewData.id, interview_type: interview_type ?? 'video', duration_minutes: duration_minutes ?? 60 },
    created_by:   orgId,
  } as unknown as ApplicationEventInsert)

  // ── Phase D: booking a plan round with a linked stage advances the candidate ──
  if (cleanUuid(plan_round_id)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: round } = await sb.from('interview_plan_rounds').select('stage_id').eq('id', plan_round_id).maybeSingle()
    const roundStage = round?.stage_id ?? null
    if (roundStage && roundStage !== stageId) {
      const { data: app } = await sb.from('applications').select('stage_id').eq('id', application_id).eq('org_id', orgId).maybeSingle()
      if (app && app.stage_id !== roundStage) {
        const [{ data: fromS }, { data: toS }] = await Promise.all([
          app.stage_id ? sb.from('pipeline_stages').select('name').eq('id', app.stage_id).maybeSingle() : Promise.resolve({ data: null }),
          sb.from('pipeline_stages').select('name').eq('id', roundStage).maybeSingle(),
        ])
        await sb.from('applications').update({ stage_id: roundStage }).eq('id', application_id).eq('org_id', orgId)
        await sb.from('application_events').insert({
          application_id, org_id: orgId, event_type: 'stage_moved',
          from_stage: fromS?.name ?? null, to_stage: toS?.name ?? null,
          note: 'Advanced by scheduling the interview round.', created_by: orgId,
        })
      }
    }
  }

  // ── Fire notifications (non-blocking) ────────────────────────────────────
  // Fetch recruiter + candidate info for notification copy
  ;(async () => {
    try {
      const context = await getCanonicalCandidateJobContext(supabase, orgId, application_id)
      const candData = context?.candidate ?? null
      const hrData = context?.job ?? null

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

  // ── Schedule 24h + 1h reminders + emit webhook ───────────────────────────
  // Only for a real confirmed time. A self-schedule link has no time yet — its
  // reminders/webhook fire when the candidate books (in /schedule/[token]/confirm).
  if (!generate_self_schedule) {
    await scheduleInterviewReminders({
      orgId,
      interviewId: String(interviewData.id),
      scheduledAt: scheduled_at,
      timezone:    timezone ?? null,
    })

    emitWebhook(orgId, 'interview.scheduled', {
      interview_id:      interviewData.id,
      application_id,
      candidate_id,
      hiring_request_id,
      scheduled_at,
      interview_type:    interview_type ?? 'video',
      duration_minutes:  duration_minutes ?? 60,
      meeting_platform:  resolvedPlatform,
    }).catch(e => logger.error('[interviews] webhook emit failed', e))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const selfScheduleLink = self_schedule_token ? `${appUrl}/schedule/${self_schedule_token}` : null
  return { ok: true, data: { ...interviewData, meet_link: meetLink, meeting_link: meetLink, meeting_platform: resolvedPlatform, google_meet_error: googleMeetError, self_schedule_link: selfScheduleLink } }
}
