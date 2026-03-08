import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import type { CandidateUpdate } from '@/lib/types/database'

// GET /api/candidates/:id — candidate + all applications (with job + stage) + all events
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { id } = params

  const [candRes, appsRes] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', id).eq('org_id', orgId).single(),
    supabase
      .from('applications')
      .select('*, pipeline_stages(name, color), hiring_requests(id, position_title, department)')
      .eq('candidate_id', id)
      .eq('org_id', orgId)
      .order('applied_at', { ascending: false }),
  ])

  if (candRes.error) {
    const status = candRes.error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: candRes.error.message }, { status })
  }

  // Fetch events for all applications
  const appIds = (appsRes.data ?? []).map((a: { id: string }) => a.id)
  const { data: events } = appIds.length
    ? await supabase
        .from('application_events')
        .select('*')
        .in('application_id', appIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  return NextResponse.json({
    data: {
      ...candRes.data,
      applications: appsRes.data ?? [],
      events: events ?? [],
    },
  })
}

// PATCH /api/candidates/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  let body: CandidateUpdate
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('candidates')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(body as any)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({ data })
}

// DELETE /api/candidates/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('candidates')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
