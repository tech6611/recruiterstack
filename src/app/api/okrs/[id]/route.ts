import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { forbidden, getViewerScope } from '@/lib/rbac'
import { okrUpdateSchema } from '@/lib/validations/okrs'
import { deleteOkr, getOkrDetail, updateOkr } from '@/modules/hris/domain/okrs'
import type { Okr } from '@/lib/types/database'

// RBAC: admin OR the OKR's owner-employee = the calling user.
async function authorizeOkr(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  userId: string,
  okrId: string,
): Promise<{ ok: true; okr: Okr } | { ok: false; res: NextResponse }> {
  const { data: row, error } = await supabase
    .from('okrs').select('*').eq('id', okrId).eq('org_id', orgId).maybeSingle()
  if (error) return { ok: false, res: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!row)  return { ok: false, res: NextResponse.json({ error: 'OKR not found' }, { status: 404 }) }
  const okr = row as Okr

  const scope = await getViewerScope(supabase, orgId, userId)
  const isOwner = scope.employeeId === okr.owner_employee_id
  if (!scope.isAdmin && !isOwner) return { ok: false, res: forbidden() }
  return { ok: true, okr }
}

// GET /api/okrs/[id] — admin / owner.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const auth = await authorizeOkr(supabase, orgId, userId, params.id)
  if (!auth.ok) return auth.res

  try {
    const data = await getOkrDetail(supabase, orgId, params.id)
    if (!data) return NextResponse.json({ error: 'OKR not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch OKR' },
      { status: 500 },
    )
  }
}

// PATCH /api/okrs/[id] — admin / owner.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const auth = await authorizeOkr(supabase, orgId, userId, params.id)
  if (!auth.ok) return auth.res

  const parsed = await parseBody(req, okrUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await updateOkr(supabase, orgId, params.id, parsed)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update OKR' },
      { status: 500 },
    )
  }
}

// DELETE /api/okrs/[id] — admin / owner.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const auth = await authorizeOkr(supabase, orgId, userId, params.id)
  if (!auth.ok) return auth.res

  try {
    await deleteOkr(supabase, orgId, params.id)
    return NextResponse.json({ data: { id: params.id, deleted: true } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete OKR' },
      { status: 500 },
    )
  }
}
