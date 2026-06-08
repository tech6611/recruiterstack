import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { forbidden, getViewerScope } from '@/lib/rbac'
import { krUpdateSchema } from '@/lib/validations/okrs'
import { deleteKeyResult, updateKeyResult } from '@/modules/hris/domain/okrs'
import type { Okr } from '@/lib/types/database'

// Resolve the KR -> parent OKR -> owner, then authorize.
async function authorizeKr(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  userId: string,
  krId: string,
): Promise<NextResponse | null> {
  const { data: kr, error: krErr } = await supabase
    .from('okr_key_results').select('okr_id').eq('id', krId).eq('org_id', orgId).maybeSingle()
  if (krErr) return NextResponse.json({ error: krErr.message }, { status: 500 })
  if (!kr) return NextResponse.json({ error: 'Key result not found' }, { status: 404 })

  const okrId = (kr as { okr_id: string }).okr_id
  const { data: okrRow } = await supabase
    .from('okrs').select('owner_employee_id').eq('id', okrId).eq('org_id', orgId).maybeSingle()
  const okr = okrRow as Pick<Okr, 'owner_employee_id'> | null
  if (!okr) return NextResponse.json({ error: 'Parent OKR not found' }, { status: 404 })

  const scope = await getViewerScope(supabase, orgId, userId)
  if (!scope.isAdmin && scope.employeeId !== okr.owner_employee_id) return forbidden()
  return null
}

// PATCH /api/okrs/key-results/[id] — admin / owner.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const guard = await authorizeKr(supabase, orgId, userId, params.id)
  if (guard) return guard

  const parsed = await parseBody(req, krUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await updateKeyResult(supabase, orgId, params.id, parsed)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update key result' },
      { status: 500 },
    )
  }
}

// DELETE /api/okrs/key-results/[id] — admin / owner.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const guard = await authorizeKr(supabase, orgId, userId, params.id)
  if (guard) return guard

  try {
    await deleteKeyResult(supabase, orgId, params.id)
    return NextResponse.json({ data: { id: params.id, deleted: true } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete key result' },
      { status: 500 },
    )
  }
}
