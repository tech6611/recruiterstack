import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { candidateUpdateSchema } from '@/lib/validations/candidates'

// GET /api/candidates/:id — candidate + all applications (with job + stage) + all events + tags + tasks + referrals
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { id } = params

  const [candRes, appsRes, tagsRes, tasksRes, referralsRes] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', id).eq('org_id', orgId).single(),
    supabase
      .from('applications')
      .select('*, pipeline_stages(name, color), hiring_requests(id, position_title, department, ticket_number, hiring_manager_name, hiring_manager_email)')
      .eq('candidate_id', id)
      .eq('org_id', orgId)
      .order('applied_at', { ascending: false }),
    supabase
      .from('candidate_tags')
      .select('*')
      .eq('candidate_id', id)
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('candidate_tasks')
      .select('*')
      .eq('candidate_id', id)
      .eq('org_id', orgId)
      .order('completed_at', { ascending: true, nullsFirst: true })
      .order('due_date',     { ascending: true, nullsFirst: false })
      .order('created_at',   { ascending: false }),
    supabase
      .from('candidate_referrals')
      .select('*')
      .eq('candidate_id', id)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
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
      events:       events        ?? [],
      tags:         tagsRes.data  ?? [],
      tasks:        tasksRes.data ?? [],
      referrals:    referralsRes.data ?? [],
    },
  })
}

// PATCH /api/candidates/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const parsed = await parseBody(request, candidateUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  const { data, error } = await supabase
    .from('candidates')
    .update(parsed as import('@/lib/types/database').CandidateUpdate)
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
  const authResult = await requireOrg()
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
