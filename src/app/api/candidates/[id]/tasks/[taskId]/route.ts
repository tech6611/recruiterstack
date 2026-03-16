import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// PATCH /api/candidates/[id]/tasks/[taskId]
// Accepts: title, description, due_date, assignee_name, completed (boolean)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; taskId: string } },
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

  const supabase = createAdminClient()

  const updates: Record<string, unknown> = {}
  if (body.title        !== undefined) updates.title         = (body.title as string).trim()
  if (body.description  !== undefined) updates.description   = body.description
  if (body.due_date     !== undefined) updates.due_date      = body.due_date
  if (body.assignee_name !== undefined) updates.assignee_name = body.assignee_name

  // Toggle completion
  if (body.completed === true)  updates.completed_at = new Date().toISOString()
  if (body.completed === false) updates.completed_at = null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('candidate_tasks')
    .update(updates as never)
    .eq('id', params.taskId)
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({ data })
}

// DELETE /api/candidates/[id]/tasks/[taskId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('candidate_tasks')
    .delete()
    .eq('id', params.taskId)
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
