import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/applications/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const [appRes, eventsRes] = await Promise.all([
    supabase
      .from('applications')
      .select('*, candidate:candidates(*), pipeline_stages(name, color)')
      .eq('id', params.id)
      .eq('org_id', orgId)
      .single(),
    supabase
      .from('application_events')
      .select('*')
      .eq('application_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (appRes.error) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    data: { ...appRes.data, events: eventsRes.data ?? [] },
  })
}

// PATCH /api/applications/[id]
// body: { stage_id }                  → move to stage
//     | { status }                    → reject / withdraw / hire
//     | { note, event_type? }         → add note
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Fetch current application ─────────────────────────────────────────────
  const { data: current, error: fetchErr } = await supabase
    .from('applications')
    .select('*, pipeline_stages(name)')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // ── Stage move ────────────────────────────────────────────────────────────
  if ('stage_id' in body) {
    const { stage_id } = body as { stage_id: string | null }

    // Get new stage name for event
    let newStageName: string | null = null
    if (stage_id) {
      const { data: newStage } = await supabase
        .from('pipeline_stages')
        .select('name')
        .eq('id', stage_id)
        .single()
      newStageName = newStage?.name ?? null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase
      .from('applications')
      .update({ stage_id } as never)
      .eq('id', params.id)
      .select('*, candidate:candidates(*)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Record event
    await supabase
      .from('application_events')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        application_id: params.id,
        event_type: 'stage_moved',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        from_stage: (current.pipeline_stages as any)?.name ?? null,
        to_stage: newStageName,
        created_by: 'Recruiter',
        org_id: orgId,
      } as any)

    return NextResponse.json({ data })
  }

  // ── Status change ─────────────────────────────────────────────────────────
  if ('status' in body) {
    const { status } = body as { status: string }

    const { data, error } = await supabase
      .from('applications')
      .update({ status } as never)
      .eq('id', params.id)
      .select('*, candidate:candidates(*)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase
      .from('application_events')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        application_id: params.id,
        event_type: 'status_changed',
        to_stage: status,
        created_by: 'Recruiter',
        org_id: orgId,
      } as any)

    return NextResponse.json({ data })
  }

  // ── Add note ──────────────────────────────────────────────────────────────
  if ('note' in body) {
    const { note, created_by = 'Recruiter' } = body as { note: string; created_by?: string }

    if (!note?.trim()) {
      return NextResponse.json({ error: 'note cannot be empty' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('application_events')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        application_id: params.id,
        event_type: 'note_added',
        note,
        created_by,
        org_id: orgId,
      } as any)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}
