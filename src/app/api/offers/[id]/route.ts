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
    .from('offers')
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

  // Augment timestamps based on status transitions
  const updatePayload: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() }
  if (body.status === 'approved')  updatePayload.approved_at  = new Date().toISOString()
  if (body.status === 'sent')      updatePayload.sent_at      = new Date().toISOString()
  if (body.status === 'accepted' || body.status === 'declined')
                                   updatePayload.responded_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('offers')
    .update(updatePayload)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const offer = data as any
  // Log application event for significant status transitions
  const eventMap: Record<string, string> = {
    approved: 'offer_approved',
    sent:     'offer_sent',
    accepted: 'offer_accepted',
    declined: 'offer_declined',
  }
  const eventType = body.status ? eventMap[body.status] : null
  if (eventType) {
    await supabase.from('application_events').insert({
      application_id: offer.application_id,
      org_id:         orgId,
      event_type:     eventType,
      note:           `Offer ${body.status}${body.approved_by ? ` by ${body.approved_by}` : ''}`,
      metadata:       { offer_id: params.id },
      created_by:     orgId,
    } as any)

    // Sync candidate status when offer accepted
    if (body.status === 'accepted') {
      await supabase
        .from('candidates')
        .update({ status: 'hired', updated_at: new Date().toISOString() })
        .eq('id', offer.candidate_id)
        .eq('org_id', orgId)
    }
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
    .from('offers')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
