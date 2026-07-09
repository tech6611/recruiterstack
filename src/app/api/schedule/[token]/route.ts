import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { computeOpenSlots, nextBusinessDays, zonedWallClockToUtcMs } from '@/lib/interviews/availability'
import { getBusyForEmails } from '@/lib/interviews/busy'
import { getInterviewerPreferences } from '@/modules/ats/domain/interviewer-preferences'
import { getCanonicalCandidateJobContext } from '@/modules/ats/domain/job-pipelines'
import { logger } from '@/lib/logger'

// Availability depends on live interviewer prefs + calendars. Never cache these
// reads — a stale cache was serving old preferred-hours (e.g. 6 PM after the HM
// had extended to 11 PM), silently hiding real slots.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const BUSINESS_DAY_COUNT = 7

// GET /api/schedule/[token] — public, no auth.
// Returns interview metadata + the open slots the candidate can book across the
// next 7 business days (interviewer preferred hours ∩ real calendar free/busy).
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params
  const supabase = createAdminClient()

  const { data: interview, error } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title)')
    .eq('self_schedule_token', token)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single() as { data: any; error: any }

  if (error || !interview) {
    return NextResponse.json({ error: 'Invalid or expired scheduling link' }, { status: 404 })
  }
  if (interview.self_schedule_expires_at && new Date(interview.self_schedule_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This scheduling link has expired. Please contact your recruiter for a new one.' }, { status: 410 })
  }
  if (interview.status === 'cancelled') {
    return NextResponse.json({ error: 'This interview has been cancelled. Please contact your recruiter.' }, { status: 410 })
  }

  // Interviewer emails: the panel, falling back to the single interviewer_email.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const panelMembers: { name: string; email: string }[] = interview.panel ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emails: string[] = panelMembers.map((m: any) => m?.email).filter(Boolean)
  if (emails.length === 0 && interview.interviewer_email) emails.push(interview.interviewer_email)

  let slots: { start: string; end: string }[] = []
  let calendarChecked = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let interviewersUsed: any = undefined
  if (emails.length > 0) {
    try {
      const result = await computeOpenSlots({
        supabase,
        orgId:           interview.org_id,
        emails,
        durationMinutes: interview.duration_minutes ?? 60,
        businessDayCount: BUSINESS_DAY_COUNT,
      })
      slots = result.slots
      calendarChecked = result.calendarChecked
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      interviewersUsed = (result as any)._interviewersUsed
    } catch (e) {
      logger.error('[schedule] open-slot computation failed', e)
    }
  }

  // Legacy hiring_request_id is null for canonical-job apps, so the join above
  // is empty — fall back to the canonical job title so the candidate sees the role.
  let canonicalPositionTitle: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(interview.hiring_request as any)?.position_title) {
    try {
      const ctx = await getCanonicalCandidateJobContext(supabase, interview.org_id, interview.application_id)
      canonicalPositionTitle = ctx?.job?.position_title ?? null
    } catch { /* non-fatal — title is cosmetic */ }
  }

  // Temporary diagnostic: ?debug=1 exposes the raw busy blocks + preferred
  // windows + timing the engine used, so we can see exactly why a day is empty.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _debug: any = undefined
  if (req.nextUrl.searchParams.get('debug') === '1' && emails.length > 0) {
    try {
      const nowMs  = Date.now()
      const prefs  = await getInterviewerPreferences(supabase, interview.org_id, emails)
      const refTz  = prefs[emails[0].toLowerCase()]?.timezone || 'Asia/Kolkata'
      const dates  = nextBusinessDays(refTz, BUSINESS_DAY_COUNT, nowMs)
      const last   = dates[dates.length - 1]
      const rangeEnd = zonedWallClockToUtcMs(refTz, last.y, last.m0, last.d, 1440)
      const { busy, calendarConnected } = await getBusyForEmails(
        supabase, interview.org_id, emails,
        new Date(nowMs).toISOString(), new Date(rangeEnd).toISOString(),
      )
      _debug = {
        now_utc: new Date(nowMs).toISOString(),
        earliest_bookable_utc: new Date(nowMs + 120 * 60_000).toISOString(),
        refTz,
        emails,
        interview_duration: interview.duration_minutes ?? 60,
        prefs_from_debug_read: prefs,
        interviewers_used_by_engine: interviewersUsed,
        calendar_connected: calendarConnected,
        busy,
      }
    } catch (e) {
      _debug = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({
    interview: {
      id:               interview.id,
      token,
      interviewer_name: interview.interviewer_name,
      interview_type:   interview.interview_type,
      duration_minutes: interview.duration_minutes,
      meeting_platform: interview.meeting_platform,
      status:           interview.status,
      // Already booked? show the confirmed time (a placeholder self-schedule row
      // has no calendar_event_id yet, so it stays null → candidate picks a slot).
      scheduled_at:     interview.status === 'scheduled' && interview.calendar_event_id ? interview.scheduled_at : null,
      expires_at:       interview.self_schedule_expires_at,
      panel:            panelMembers,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    position_title:     (interview.hiring_request as any)?.position_title ?? canonicalPositionTitle,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candidate_name:     (interview.candidate as any)?.name ?? null,
    slots,
    business_day_count: BUSINESS_DAY_COUNT,
    has_interviewers:   emails.length > 0,
    calendar_checked:   calendarChecked,
    ...(_debug ? { _debug } : {}),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
