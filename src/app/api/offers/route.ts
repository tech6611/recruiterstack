import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { offerInsertSchema } from '@/lib/validations/offers'

export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { searchParams } = req.nextUrl
  const application_id    = searchParams.get('application_id')
  const candidate_id      = searchParams.get('candidate_id')
  const hiring_request_id = searchParams.get('hiring_request_id')
  const status            = searchParams.get('status')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('offers')
    .select('*, candidate:candidates(name, email), hiring_request:hiring_requests(position_title, ticket_number)')
    .eq('org_id', orgId)

  if (application_id)    q = q.eq('application_id', application_id)
  if (candidate_id)      q = q.eq('candidate_id', candidate_id)
  if (hiring_request_id) q = q.eq('hiring_request_id', hiring_request_id)
  if (status)            q = q.eq('status', status)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const parsed = await parseBody(req, offerInsertSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('offers')
    .insert({
      org_id: orgId,
      ...parsed,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)

  // Log application event
  await supabase.from('application_events').insert({
    application_id: parsed.application_id,
    org_id:     orgId,
    event_type: 'offer_created',
    note:       `Offer created — ${parsed.position_title}${parsed.base_salary ? ` · $${Number(parsed.base_salary).toLocaleString()}` : ''}`,
    metadata:   { offer_id: data.id },
    created_by: orgId,
  })

  // Update candidate status to offer_extended
  await supabase
    .from('candidates')
    .update({ status: 'offer_extended', updated_at: new Date().toISOString() })
    .eq('id', parsed.candidate_id)
    .eq('org_id', orgId)

  return NextResponse.json({ data }, { status: 201 })
}
