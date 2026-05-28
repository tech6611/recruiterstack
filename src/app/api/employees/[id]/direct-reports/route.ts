import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { canViewEmployee, forbidden, getViewerScope } from '@/lib/rbac'
import { listDirectReports } from '@/modules/hris/domain/employees'

// GET /api/employees/[id]/direct-reports — admin or the manager themselves
// (viewing their own team). Other managers / unrelated employees: 403.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)

  // Either admin, or the request is asking about my own reports.
  const isSelf = scope.employeeId === params.id
  if (!scope.isAdmin && !isSelf) {
    // Allow a manager-of-this-employee to see who else reports up — useful in
    // org chart / drill-down. Restrict beyond that.
    if (!canViewEmployee(scope, params.id)) return forbidden()
  }

  try {
    const data = await listDirectReports(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch direct reports' },
      { status: 500 },
    )
  }
}
