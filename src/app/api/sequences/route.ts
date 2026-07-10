import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listSequences } from '@/modules/crm/domain/sequences'
import { resolveWindow } from '@/lib/sequences/range'

// GET /api/sequences?range=7d|30d|90d|all|custom&start=&end= — list all sequences
// for the org. The funnel counts on each row are scoped to the window (default
// 30d). `range=custom` uses the start/end YYYY-MM-DD dates.
export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  try {
    const params = new URL(req.url).searchParams
    const window = resolveWindow(params.get('range'), params.get('start'), params.get('end'))
    const data = await listSequences(supabase, orgId, window)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list sequences' },
      { status: 500 },
    )
  }
})

// POST /api/sequences — create a new sequence. (Writes still live in the route
// for v1 — domain extraction was reads-only to keep the migration mechanical.)
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase) => {
  let body: { name?: string; stages?: { order_index: number; delay_days: number; subject: string; body: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = body.name?.trim() || 'Untitled Sequence'

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
})
