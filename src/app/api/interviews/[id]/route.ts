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
    await runInterviewCancellationSideEffects(supabase, orgId, params.id)
  }

  return NextResponse.json({ data })
})

export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  // Clean up the calendar event + notify attendees *before* removing the row,
  // since the side effects need the interview's stored details.
  await runInterviewCancellationSideEffects(supabase, orgId, params.id)

  const { error } = await supabase
    .from('interviews')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
