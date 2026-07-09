import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { createAdminClient } from '@/lib/supabase/server'
import { cancelCalendarEvent } from '@/lib/integrations/cancel-event'
import { notifyInterviewCancelled } from '@/lib/notifications/interview'
import { emitWebhook } from '@/lib/webhooks/emit'
import { logger } from '@/lib/logger'

type AdminClient = ReturnType<typeof createAdminClient>

// Best-effort side effects when an interview is cancelled or deleted:
// remove the real calendar event (Google/Teams/Zoom) and notify the
// candidate + interviewer. Never throws — the caller's DB write is the
// source of truth; these are secondary.
async function runCancellationSideEffects(
  supabase: AdminClient,
  orgId: string,
  interviewId: string,
): Promise<void> {
  const { data: iv } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title)')
    .eq('id', interviewId)
    .eq('org_id', orgId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single() as { data: any; error: any }

  if (!iv) return

  // Resolve the same host chain used at creation: panel emails if present,
  // otherwise the lone interviewer.
  const panelEmails: string[] = Array.isArray(iv.panel) && iv.panel.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? iv.panel.map((m: any) => m?.email).filter(Boolean)
    : (iv.interviewer_email ? [iv.interviewer_email] : [])

  try {
    await cancelCalendarEvent({
      meetingPlatform: iv.meeting_platform ?? null,
      calendarEventId: iv.calendar_event_id ?? null,
      panelEmails,
      orgId,
    })
  } catch (e) {
    logger.error('[interviews/:id] calendar cancellation failed', e)
  }

  try {
    await notifyInterviewCancelled({
      orgId,
      candidateName:    iv.candidate?.name ?? 'Candidate',
      candidateEmail:   iv.candidate?.email ?? '',
      interviewerName:  iv.interviewer_name ?? 'Interviewer',
      interviewerEmail: iv.interviewer_email ?? null,
      positionTitle:    iv.hiring_request?.position_title ?? 'Position',
      scheduledAt:      iv.scheduled_at,
      timezone:         null,
    })
  } catch (e) {
    logger.error('[interviews/:id] cancellation notification failed', e)
  }

  emitWebhook(orgId, 'interview.cancelled', {
    interview_id:      iv.id,
    application_id:    iv.application_id,
    candidate_id:      iv.candidate_id,
    hiring_request_id: iv.hiring_request_id,
    scheduled_at:      iv.scheduled_at,
  }).catch(e => logger.error('[interviews/:id] webhook emit failed', e))
}

export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data, error } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title, ticket_number)')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ data })
})

export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await req.json()

  const { data, error } = await supabase
    .from('interviews')
    .update({ ...body, updated_at: new Date().toISOString() } as import('@/lib/types/database').InterviewUpdate)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log status change events
  if (body.status === 'completed') {
    await supabase.from('application_events').insert({
      application_id: data.application_id,
      org_id:         orgId,
      event_type:     'interview_completed',
      note:           `Interview completed with ${data.interviewer_name}`,
      metadata:       { interview_id: params.id },
      created_by:     orgId,
    })
  } else if (body.status === 'cancelled') {
    await supabase.from('application_events').insert({
      application_id: data.application_id,
      org_id:         orgId,
      event_type:     'interview_cancelled',
      note:           `Interview cancelled`,
      metadata:       { interview_id: params.id },
      created_by:     orgId,
    })
    // Remove the real calendar event and notify attendees.
    await runCancellationSideEffects(supabase, orgId, params.id)
  }

  return NextResponse.json({ data })
})

export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  // Clean up the calendar event + notify attendees *before* removing the row,
  // since the side effects need the interview's stored details.
  await runCancellationSideEffects(supabase, orgId, params.id)

  const { error } = await supabase
    .from('interviews')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
