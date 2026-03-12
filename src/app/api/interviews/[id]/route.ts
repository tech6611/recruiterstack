import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('interviews')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title, ticket_number)')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const body = await req.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('interviews')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log status change events
  if (body.status === 'completed') {
    const interview = data as any
    await supabase.from('application_events').insert({
      application_id: interview.application_id,
      org_id:         orgId,
      event_type:     'interview_completed',
      note:           `Interview completed with ${interview.interviewer_name}`,
      metadata:       { interview_id: params.id },
      created_by:     orgId,
    } as any)
  } else if (body.status === 'cancelled') {
    const interview = data as any
    await supabase.from('application_events').insert({
      application_id: interview.application_id,
      org_id:         orgId,
      event_type:     'interview_cancelled',
      note:           `Interview cancelled`,
      metadata:       { interview_id: params.id },
      created_by:     orgId,
    } as any)
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('interviews')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
