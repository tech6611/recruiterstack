import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// POST /api/sequences/[id]/stages — create a new stage (stageId is ignored for POST, route reuse)
// Actual create endpoint is /api/sequences/[id]/stages with stageId='create' or handled at parent level

// PATCH /api/sequences/[id]/stages/[stageId] — update a stage
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; stageId: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const allowed = [
    'order_index', 'delay_days', 'subject', 'body', 'send_on_behalf_of', 'send_on_behalf_email',
    'channel', 'send_at_time', 'send_timezone', 'delay_business_days', 'condition',
  ]
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  const supabase = createAdminClient()

  // Verify sequence belongs to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequence_stages') as any)
    .update(update)
    .eq('id', params.stageId)
    .eq('sequence_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

// DELETE /api/sequences/[id]/stages/[stageId] — delete a stage
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; stageId: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Verify sequence belongs to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('sequence_stages') as any)
    .delete()
    .eq('id', params.stageId)
    .eq('sequence_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
