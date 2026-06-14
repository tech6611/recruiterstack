import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getSequence } from '@/modules/crm/domain/sequences'

// GET /api/sequences/[id] — fetch sequence with stages + enrollment counts.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const data = await getSequence(supabase, orgId, params.id)
    if (!data) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch sequence' },
      { status: 500 },
    )
  }
})

// PATCH /api/sequences/[id] — update sequence (name, status, description)
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequences') as any)
    .update(update)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
})
