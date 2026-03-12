import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

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

  const body = await req.json()
  const {
    application_id, candidate_id, hiring_request_id, position_title,
    base_salary, bonus, equity, start_date, expiry_date, notes,
    offer_letter_text, created_by,
  } = body

  if (!application_id || !candidate_id || !hiring_request_id || !position_title?.trim()) {
    return NextResponse.json(
      { error: 'application_id, candidate_id, hiring_request_id, and position_title are required' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('offers')
    .insert({
      org_id:            orgId,
      application_id,
      candidate_id,
      hiring_request_id,
      position_title:    position_title.trim(),
      base_salary:       base_salary ?? null,
      bonus:             bonus ?? null,
      equity:            equity?.trim() || null,
      start_date:        start_date ?? null,
      expiry_date:       expiry_date ?? null,
      notes:             notes?.trim() || null,
      offer_letter_text: offer_letter_text?.trim() || null,
      status:            'draft',
      created_by:        created_by ?? null,
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log application event
  await supabase.from('application_events').insert({
    application_id,
    org_id:     orgId,
    event_type: 'offer_created',
    note:       `Offer created — ${position_title.trim()}${base_salary ? ` · $${Number(base_salary).toLocaleString()}` : ''}`,
    metadata:   { offer_id: (data as any).id },
    created_by: orgId,
  } as any)

  // Update candidate status to offer_extended
  await supabase
    .from('candidates')
    .update({ status: 'offer_extended', updated_at: new Date().toISOString() })
    .eq('id', candidate_id)
    .eq('org_id', orgId)

  return NextResponse.json({ data }, { status: 201 })
}
