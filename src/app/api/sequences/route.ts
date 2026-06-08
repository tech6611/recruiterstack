import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { listSequences } from '@/modules/crm/domain/sequences'

// GET /api/sequences — list all sequences for the org.
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listSequences(supabase, orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list sequences' },
      { status: 500 },
    )
  }
}

// POST /api/sequences — create a new sequence. (Writes still live in the route
// for v1 — domain extraction was reads-only to keep the migration mechanical.)
export async function POST(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: { name?: string; stages?: { order_index: number; delay_days: number; subject: string; body: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = body.name?.trim() || 'Untitled Sequence'

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq, error: seqErr } = await (supabase.from('sequences') as any)
    .insert({ org_id: orgId, name, status: 'draft' })
    .select()
    .single()

  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 })

  if (body.stages && body.stages.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_stages') as any)
      .insert(body.stages.map(s => ({
        sequence_id: seq.id,
        order_index: s.order_index,
        delay_days:  s.delay_days,
        subject:     s.subject,
        body:        s.body,
      })))
  }

  return NextResponse.json({ data: seq }, { status: 201 })
}
