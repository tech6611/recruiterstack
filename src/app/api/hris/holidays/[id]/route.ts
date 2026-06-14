import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { deleteHoliday } from '@/modules/hris/domain/leave-balances'

// DELETE /api/hris/holidays/[id] — admin only.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'leave:edit')
  if (guard) return guard

  try {
    await deleteHoliday(supabase, orgId, params.id)
    return NextResponse.json({ data: { id: params.id, deleted: true } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete holiday' },
      { status: 500 },
    )
  }
}
