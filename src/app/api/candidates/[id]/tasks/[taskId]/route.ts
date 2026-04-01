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
  if (body.title         !== undefined) updates.title         = (body.title as string).trim()
  if (body.description   !== undefined) updates.description   = body.description
  if (body.due_date      !== undefined) updates.due_date      = body.due_date
  if (body.assignee_name !== undefined) updates.assignee_name = body.assignee_name

  // Status change — also syncs completed_at unless completed is explicitly provided
  if (body.status !== undefined) {
    updates.status = body.status
    if (body.completed === undefined) {
      updates.completed_at = body.status === 'done' ? new Date().toISOString() : null
    }
  }

  // Toggle completion — also syncs status unless status is explicitly provided
  if (body.completed === true) {
    updates.completed_at = new Date().toISOString()
    if (body.status === undefined) updates.status = 'done'
  }
  if (body.completed === false) {
    updates.completed_at = null
    if (body.status === undefined) updates.status = 'to_do'
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Separate status/completed_at from other updates for graceful fallback
  const statusUpdates: Record<string, unknown> = {}
  if ('status'       in updates) { statusUpdates.status       = updates.status;       delete updates.status }
  if ('completed_at' in updates) { statusUpdates.completed_at = updates.completed_at; delete updates.completed_at }
  const mergedUpdates = { ...updates, ...statusUpdates }

  const { data, error } = await supabase
    .from('candidate_tasks')
    .update(mergedUpdates as import('@/lib/types/database').CandidateTaskUpdate)
    .eq('id', params.taskId)
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    // 42703: status column hasn't been added via migration yet — retry without status fields
    if (error.code === '42703' || error.message?.includes('status')) {
      const safeUpdates = { ...updates }
      const { data: data2, error: error2 } = await supabase
        .from('candidate_tasks')
        .update(safeUpdates as import('@/lib/types/database').CandidateTaskUpdate)
        .eq('id', params.taskId)
        .eq('candidate_id', params.id)
        .eq('org_id', orgId)
        .select()
        .single()
      if (error2) {
        const httpStatus = error2.code === 'PGRST116' ? 404 : 500
        return NextResponse.json({ error: error2.message }, { status: httpStatus })
      }
      return NextResponse.json({ data: { ...data2, ...statusUpdates } })
    }
    const httpStatus = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status: httpStatus })
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
