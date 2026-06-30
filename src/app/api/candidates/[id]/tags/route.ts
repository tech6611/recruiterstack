import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listCandidateTags, addCandidateTag, AnnotationError } from '@/modules/ats/domain/candidate-annotations'

// GET /api/candidates/[id]/tags
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const data = await listCandidateTags(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    const status = err instanceof AnnotationError ? err.status : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status })
  }
})

// POST /api/candidates/[id]/tags
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: { tag?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const data = await addCandidateTag(supabase, orgId, params.id, body.tag ?? '')
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    const status = err instanceof AnnotationError ? err.status : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status })
  }
})
