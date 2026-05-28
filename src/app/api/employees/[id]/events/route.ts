import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCanViewEmployee, getViewerScope } from '@/lib/rbac'
import { listEmployeeEvents } from '@/modules/hris/domain/employees'

// GET /api/employees/[id]/events — admin, self, or direct manager.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCanViewEmployee(scope, params.id)
  if (guard) return guard

  try {
    const data = await listEmployeeEvents(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch employee events' },
      { status: 500 },
    )
  }
}
