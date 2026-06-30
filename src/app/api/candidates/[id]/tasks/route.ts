import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listCandidateTasks, createCandidateTask, AnnotationError } from '@/modules/ats/domain/candidate-annotations'
import type { TaskStatus } from '@/lib/types/database'

// GET /api/candidates/[id]/tasks
// Returns tasks ordered: incomplete first (by due_date asc), then completed (by completed_at desc)
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const data = await listCandidateTasks(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    const status = err instanceof AnnotationError ? err.status : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status })
  }
})

// POST /api/candidates/[id]/tasks
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const data = await createCandidateTask(supabase, orgId, params.id, {
      title:         body.title as string,
      description:   (body.description    as string | undefined) ?? null,
      dueDate:       (body.due_date       as string | undefined) ?? null,
      assigneeName:  (body.assignee_name  as string | undefined) ?? null,
      applicationId: (body.application_id as string | undefined) ?? null,
      createdBy:     (body.created_by     as string | undefined) ?? null,
      status:        (body.status         as TaskStatus | undefined),
    })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    const status = err instanceof AnnotationError ? err.status : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status })
  }
})
