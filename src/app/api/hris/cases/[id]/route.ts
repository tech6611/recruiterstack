import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { hrCaseUpdateSchema } from '@/lib/validations/hr-cases'
import { assignCase, getCase, updateCaseStatus } from '@/modules/hris/domain/cases'

// GET /api/hris/cases/[id] — admin only. Case + thread.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  try {
    const result = await getCase(supabase, orgId, params.id)
    if (!result) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch case' },
      { status: 500 },
    )
  }
}

// PATCH /api/hris/cases/[id] — admin only. Update status and/or assignee.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const parsed = await parseBody(req, hrCaseUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    let updated = null
    if (parsed.assigned_to_user_id !== undefined) {
      updated = await assignCase(supabase, orgId, params.id, parsed.assigned_to_user_id ?? null)
    }
    if (parsed.status) {
      updated = await updateCaseStatus(supabase, orgId, params.id, parsed.status, userId)
    }
    if (!updated) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    return NextResponse.json({ data: updated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update case' },
      { status: 500 },
    )
  }
}
