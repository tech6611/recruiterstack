import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { leavePolicyUpdateSchema } from '@/lib/validations/leave-balances'
import { updatePolicy } from '@/modules/hris/domain/leave-balances'

// PATCH /api/hris/leave-policies/[id] — admin only.
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

  const parsed = await parseBody(req, leavePolicyUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await updatePolicy(supabase, orgId, params.id, parsed)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update policy' },
      { status: 500 },
    )
  }
}
