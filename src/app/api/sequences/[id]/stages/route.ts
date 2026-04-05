import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// POST /api/sequences/[id]/stages — create a new stage
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const supabase = createAdminClient()

  // Verify sequence belongs to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  const stage = {
    org_id: orgId,
    sequence_id: params.id,
    order_index: body.order_index ?? 1,
    delay_days: body.delay_days ?? 0,
    delay_minutes: body.delay_minutes ?? 0,
    subject: body.subject ?? '',
    body: body.body ?? '',
    send_on_behalf_of: body.send_on_behalf_of ?? '',
    send_on_behalf_email: body.send_on_behalf_email ?? '',
    channel: body.channel ?? 'email',
    send_at: body.send_at ?? null,
    send_at_time: body.send_at_time ?? null,
    send_timezone: body.send_timezone ?? 'UTC',
    delay_business_days: body.delay_business_days ?? false,
    condition: body.condition ?? null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequence_stages') as any)
    .insert(stage)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data }, { status: 201 })
}
