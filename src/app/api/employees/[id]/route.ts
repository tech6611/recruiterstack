import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertCapability, assertCanViewEmployee, getViewerScope } from '@/lib/rbac'
import { employeeTransitionSchema } from '@/lib/validations/employees'
import {
  getEmployeeDetail,
  markEmployeeJoined,
  markEmployeeTerminated,
} from '@/modules/hris/domain/employees'

// GET /api/employees/[id] — admin, self, or the employee's direct manager.
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
    const data = await getEmployeeDetail(supabase, orgId, params.id)
    if (!data) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch employee' },
      { status: 500 },
    )
  }
}

// PATCH /api/employees/[id] — admin only. Lifecycle transitions (join/terminate).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'people:edit')
  if (guard) return guard

  const parsed = await parseBody(req, employeeTransitionSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data =
      parsed.action === 'join'
        ? await markEmployeeJoined(supabase, orgId, params.id, parsed.start_date)
        : await markEmployeeTerminated(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update employee' },
      { status: 500 },
    )
  }
}
