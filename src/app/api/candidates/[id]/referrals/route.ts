import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// GET /api/candidates/[id]/referrals
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data, error } = await supabase
    .from('candidate_referrals')
    .select('*')
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
})

// POST /api/candidates/[id]/referrals
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const referrerName = (body.referrer_name as string | undefined)?.trim()
  if (!referrerName) {
    return NextResponse.json({ error: 'referrer_name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('candidate_referrals')
    .insert({
      org_id:         orgId,
      candidate_id:   params.id,
      application_id: (body.application_id  as string | undefined) ?? null,
      referrer_name:  referrerName,
      referrer_email: (body.referrer_email   as string | undefined) ?? null,
      note:           (body.note             as string | undefined) ?? null,
    } as never)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
})
