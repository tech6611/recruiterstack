import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { runInterviewCancellationSideEffects } from '@/lib/interviews/cancel'

export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data, error } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), application:applications(job:jobs(title), opening:openings(title))')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // The legacy hiring_requests table was dropped in the canonical migration. Derive
  // the role title from the application's canonical job/opening and keep the
  // `hiring_request` shape the client expects (ticket_number has no canonical field).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = (data as any).application
  const hiring_request = {
    position_title: app?.job?.title ?? app?.opening?.title ?? null,
    ticket_number: null,
  }
  return NextResponse.json({ data: { ...data, hiring_request } })
})

export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await req.json()

  // Only these fields may be updated via PATCH — mirrors the Django handler and
  // stops a client from overwriting identity columns (org_id / candidate_id / id).
  const ALLOWED = [
    'interviewer_name', 'interviewer_email', 'interview_type',
    'scheduled_at', 'duration_minutes', 'location', 'notes',
    'status', 'stage_id', 'calendar_event_id',
  ] as const
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of ALLOWED) if (f in body) patch[f] = body[f]

  const { data, error } = await supabase
    .from('interviews')
    .update(patch as import('@/lib/types/database').InterviewUpdate)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attribute History events to the acting user (fall back to org), like Django.
  const actor = userId || orgId

  // Log status change events
  if (body.status === 'completed') {
    await supabase.from('application_events').insert({
      application_id: data.application_id,
      org_id:         orgId,
      event_type:     'interview_completed',
      note:           `Interview completed with ${data.interviewer_name}`,
      metadata:       { interview_id: params.id },
      created_by:     actor,
    })
  } else if (body.status === 'cancelled') {
    await supabase.from('application_events').insert({
      application_id: data.application_id,
      org_id:         orgId,
      event_type:     'interview_cancelled',
      note:           `Interview cancelled`,
      metadata:       { interview_id: params.id },
      created_by:     actor,
    })
    // Remove the real calendar event and notify attendees.
    await runInterviewCancellationSideEffects(supabase, orgId, params.id)
  } else if (body.scheduled_at !== undefined) {
    // Time moved without a status change — record the reschedule on History.
    await supabase.from('application_events').insert({
      application_id: data.application_id,
      org_id:         orgId,
      event_type:     'interview_scheduled',
      note:           `Interview rescheduled with ${data.interviewer_name}`,
      metadata:       { interview_id: params.id, rescheduled: true },
      created_by:     actor,
    })
  }

  return NextResponse.json({ data })
})

export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  // Read the row first: we need its application_id/interviewer for the History
  // entry, and the calendar side effects need its stored details.
  const { data: interview } = await supabase
    .from('interviews')
    .select('application_id, interviewer_name')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  // Clean up the calendar event + notify attendees *before* removing the row,
  // since the side effects need the interview's stored details.
  await runInterviewCancellationSideEffects(supabase, orgId, params.id)

  const { error } = await supabase
    .from('interviews')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (interview?.application_id) {
    await supabase.from('application_events').insert({
      application_id: interview.application_id,
      org_id:         orgId,
      event_type:     'interview_cancelled',
      note:           `Interview deleted${interview.interviewer_name ? ` (with ${interview.interviewer_name})` : ''}`,
      metadata:       { interview_id: params.id, deleted: true },
      created_by:     userId || orgId,
    })
  }

  return NextResponse.json({ success: true })
})
