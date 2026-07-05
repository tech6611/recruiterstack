import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// POST /api/sequences/[id]/stages — create a new stage
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Verify sequence belongs to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // Append new stages at the end: assign order_index = current max + 1 on the
  // server. (The client used to default this to 1, which scrambled ordering and
  // could make a new stage look like the first step.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastStage } = await (supabase.from('sequence_stages') as any)
    .select('order_index')
    .eq('sequence_id', params.id)
    .order('order_index', { ascending: false })
    .limit(1)
  const nextOrderIndex = ((lastStage?.[0]?.order_index as number | undefined) ?? 0) + 1

  const stage = {
    org_id: orgId,
    sequence_id: params.id,
    order_index: nextOrderIndex,
    delay_days: body.delay_days ?? 0,
    delay_minutes: body.delay_minutes ?? 0,
    subject: body.subject ?? '',
    body: body.body ?? '',
    send_on_behalf_of: body.send_on_behalf_of ?? '',
    send_on_behalf_email: body.send_on_behalf_email ?? '',
    channel: body.channel ?? 'email',
    send_at: body.send_at ?? null,
    send_at_time: body.send_at_time ?? null,
    send_timezone: body.send_timezone ?? 'Asia/Kolkata',
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
})
