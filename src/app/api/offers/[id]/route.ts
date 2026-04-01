import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { offerUpdateSchema } from '@/lib/validations/offers'

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

  const parsed = await parseBody(req, offerUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()

  // Augment timestamps based on status transitions
  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = { ...parsed, updated_at: now }
  if (parsed.status === 'approved')  updatePayload.approved_at  = now
  if (parsed.status === 'sent')      updatePayload.sent_at      = now
  if (parsed.status === 'accepted' || parsed.status === 'declined')
                                     updatePayload.responded_at = now

  const { data, error } = await supabase
    .from('offers')
    .update(updatePayload as import('@/lib/types/database').OfferUpdate)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return handleSupabaseError(error)

  const offer = data as { application_id: string; candidate_id: string }
  // Log application event for significant status transitions
  const eventMap: Record<string, string> = {
    approved: 'offer_approved',
    sent:     'offer_sent',
    accepted: 'offer_accepted',
    declined: 'offer_declined',
  }
  const eventType = parsed.status ? eventMap[parsed.status] : null
  if (eventType) {
    await supabase.from('application_events').insert({
      application_id: offer.application_id,
      org_id:         orgId,
      event_type:     eventType,
      note:           `Offer ${parsed.status}${parsed.approved_by ? ` by ${parsed.approved_by}` : ''}`,
      metadata:       { offer_id: params.id },
      created_by:     orgId,
    })

    // Sync candidate status when offer accepted
    if (parsed.status === 'accepted') {
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
