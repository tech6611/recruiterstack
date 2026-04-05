import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/sequences/[id] — fetch sequence with stages
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequences') as any)
    .select('*, sequence_stages(*)')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // Rename sequence_stages → stages to match frontend expectations (Django used "stages")
  if (data.sequence_stages) {
    data.stages = data.sequence_stages.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
    delete data.sequence_stages
  } else {
    data.stages = []
  }

  // Add enrollment_count and reply_count (Django included these via _full_sequence)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: enrollmentCount } = await (supabase.from('sequence_enrollments') as any)
    .select('id', { count: 'exact', head: true })
    .eq('sequence_id', params.id)
    .eq('org_id', orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: replyCount } = await (supabase.from('sequence_enrollments') as any)
    .select('id', { count: 'exact', head: true })
    .eq('sequence_id', params.id)
    .eq('org_id', orgId)
    .eq('status', 'replied')

  data.enrollment_count = enrollmentCount ?? 0
  data.reply_count = replyCount ?? 0

  return NextResponse.json({ data })
}

// PATCH /api/sequences/[id] — update sequence (name, status, description)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const allowed = ['name', 'status', 'description']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequences') as any)
    .update(update)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
