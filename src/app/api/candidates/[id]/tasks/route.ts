import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/candidates/[id]/tasks
// Returns tasks ordered: incomplete first (by due_date asc), then completed (by completed_at desc)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('candidate_tasks')
    .select('*')
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)
    .order('completed_at', { ascending: true, nullsFirst: true })
    .order('due_date',      { ascending: true, nullsFirst: false })
    .order('created_at',    { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

// POST /api/candidates/[id]/tasks
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = (body.title as string | undefined)?.trim()
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const baseInsert = {
    org_id:         orgId,
    candidate_id:   params.id,
    application_id: (body.application_id as string | undefined) ?? null,
    title,
    description:    (body.description   as string | undefined) ?? null,
    due_date:       (body.due_date       as string | undefined) ?? null,
    assignee_name:  (body.assignee_name  as string | undefined) ?? null,
    created_by:     (body.created_by     as string | undefined) ?? 'Recruiter',
  }

  const statusValue = ((body.status as string | undefined) ?? 'to_do') as import('@/lib/types/database').TaskStatus

  const { data, error } = await supabase
    .from('candidate_tasks')
    .insert({ ...baseInsert, status: statusValue })
    .select()
    .single()

  if (error) {
    // PGRST204/42703: status column hasn't been added via migration yet — retry without it
    if (error.code === '42703' || error.message?.includes('status')) {
      const { data: data2, error: error2 } = await supabase
        .from('candidate_tasks')
        .insert(baseInsert)
        .select()
        .single()
      if (error2) return NextResponse.json({ error: error2.message }, { status: 500 })
      return NextResponse.json({ data: { ...data2, status: statusValue } }, { status: 201 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
