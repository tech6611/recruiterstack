import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// PATCH /api/automations/[id] — update a rule (toggle enabled, rename, retarget)
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const allowed = ['name', 'enabled', 'trigger_type', 'trigger_value', 'sequence_id']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }
  if ('trigger_type' in update && !['tag_added', 'stage_moved', 'applied', 'status_changed'].includes(String(update.trigger_type))) {
    return NextResponse.json({ error: 'Invalid trigger_type' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase as any).from('sequence_enrollment_rules'))
    .update(update)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select('*, sequences(name, status)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  return NextResponse.json({ data })
})

// DELETE /api/automations/[id] — remove a rule
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase as any).from('sequence_enrollment_rules'))
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
})
