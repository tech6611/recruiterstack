import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// POST /api/jobs/[id]/stages
// body: { action: 'create', name, color }
//     | { action: 'reorder', stages: [{id, order_index}] }
//     | { action: 'update', id, name?, color? }
//     | { action: 'delete', id }
export const POST = withCapability('recruiting:edit', async (request, orgId, supabase, { params }) => {
  const jobId = params.id

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action as string

  // ── Create a new stage ────────────────────────────────────────────────────
  if (action === 'create') {
    const { name, color = 'slate' } = body as { name: string; color?: string }
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    // Get current max order_index
    const { data: existing } = await supabase
      .from('pipeline_stages')
      .select('order_index')
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0

    const { data, error } = await supabase
      .from('pipeline_stages')
      .insert({ hiring_request_id: jobId, name, color: color as import('@/lib/types/database').StageColor, order_index: nextIndex, org_id: orgId })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  }

  // ── Bulk reorder ──────────────────────────────────────────────────────────
  if (action === 'reorder') {
    const { stages } = body as { stages: { id: string; order_index: number }[] }
    if (!stages?.length) return NextResponse.json({ error: 'stages array required' }, { status: 400 })

    const updates = stages.map(s =>
      supabase
        .from('pipeline_stages')
        .update({ order_index: s.order_index })
        .eq('id', s.id)
        .eq('hiring_request_id', jobId)
        .eq('org_id', orgId)
    )
    await Promise.all(updates)
    return NextResponse.json({ ok: true })
  }

  // ── Update a stage (rename / recolor) ─────────────────────────────────────
  if (action === 'update') {
    const { id, name, color } = body as { id: string; name?: string; color?: string }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch: import('@/lib/types/database').PipelineStageUpdate = {}
    if (name !== undefined) patch.name = name
    if (color !== undefined) patch.color = color as import('@/lib/types/database').StageColor

    const { data, error } = await supabase
      .from('pipeline_stages')
      .update(patch)
      .eq('id', id)
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // ── Delete a stage ────────────────────────────────────────────────────────
  if (action === 'delete') {
    const { id } = body as { id: string }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Null out stage_id on any applications in this stage
    await supabase
      .from('applications')
      .update({ stage_id: null })
      .eq('stage_id', id)
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)

    const { error } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('id', id)
      .eq('hiring_request_id', jobId)
      .eq('org_id', orgId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
})
