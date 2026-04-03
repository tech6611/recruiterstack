import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/sequences — list all sequences for the org
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sequences, error } = await (supabase.from('sequences') as any)
    .select('*, sequence_stages(id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch enrollment counts per sequence
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollments } = await (supabase.from('sequence_enrollments') as any)
    .select('sequence_id, status')
    .in('sequence_id', (sequences ?? []).map((s: { id: string }) => s.id))

  const enrollmentMap = new Map<string, { total: number; replied: number }>()
  for (const e of enrollments ?? []) {
    const entry = enrollmentMap.get(e.sequence_id) ?? { total: 0, replied: 0 }
    entry.total++
    if (e.status === 'replied') entry.replied++
    enrollmentMap.set(e.sequence_id, entry)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (sequences ?? []).map((s: any) => ({
    ...s,
    stage_count: s.sequence_stages?.length ?? 0,
    enrollment_count: enrollmentMap.get(s.id)?.total ?? 0,
    reply_count: enrollmentMap.get(s.id)?.replied ?? 0,
    sequence_stages: undefined,
  }))

  return NextResponse.json({ data: result })
}

// POST /api/sequences — create a new sequence
export async function POST(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: { name?: string; stages?: { order_index: number; delay_days: number; subject: string; body: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = body.name?.trim() || 'Untitled Sequence'

  const supabase = createAdminClient()

  // Create sequence
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq, error: seqErr } = await (supabase.from('sequences') as any)
    .insert({ org_id: orgId, name, status: 'draft' })
    .select()
    .single()

  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 })

  // Create initial stages if provided
  if (body.stages && body.stages.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_stages') as any)
      .insert(body.stages.map(s => ({
        sequence_id: seq.id,
        order_index: s.order_index,
        delay_days: s.delay_days,
        subject: s.subject,
        body: s.body,
      })))
  }

  return NextResponse.json({ data: seq }, { status: 201 })
}
