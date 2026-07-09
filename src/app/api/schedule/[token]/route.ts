import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { computeOpenSlots } from '@/lib/interviews/availability'
import { getCanonicalCandidateJobContext } from '@/modules/ats/domain/job-pipelines'
import { logger } from '@/lib/logger'

const BUSINESS_DAY_COUNT = 7

// GET /api/schedule/[token] — public, no auth.
// Returns interview metadata + the open slots the candidate can book across the
// next 7 business days (interviewer preferred hours ∩ real calendar free/busy).
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
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
  }, { headers: { 'Cache-Control': 'no-store' } })
}
