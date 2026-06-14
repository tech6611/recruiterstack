import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { hrDocumentUpdateSchema } from '@/lib/validations/hr-documents'
import { deleteDocument, getDocument, updateDocument } from '@/modules/hris/domain/documents'

// GET /api/hris/documents/[id] — admin only.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'documents:view')
  if (guard) return guard

  try {
    const data = await getDocument(supabase, orgId, params.id)
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch document' },
      { status: 500 },
    )
  }
}

// PATCH /api/hris/documents/[id] — admin only.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'documents:edit')
  if (guard) return guard

  const parsed = await parseBody(req, hrDocumentUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await updateDocument(supabase, orgId, params.id, parsed)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update document' },
      { status: 500 },
    )
  }
}

// DELETE /api/hris/documents/[id] — admin only.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'documents:edit')
  if (guard) return guard

  try {
    await deleteDocument(supabase, orgId, params.id)
    return NextResponse.json({ data: { id: params.id, deleted: true } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete document' },
      { status: 500 },
    )
  }
}
