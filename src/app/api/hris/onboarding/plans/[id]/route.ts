import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { canViewEmployee, forbidden, getViewerScope } from '@/lib/rbac'
import { listPlanTasks } from '@/modules/hris/domain/onboarding'
import type { OnboardingPlan } from '@/lib/types/database'

// GET /api/hris/onboarding/plans/[id] — plan + its tasks. Admin, or the employee
// whose plan it is, or that employee's direct manager.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const { data: planRow, error } = await supabase
    .from('onboarding_plans')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!planRow) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  const plan = planRow as OnboardingPlan

  const scope = await getViewerScope(supabase, orgId, userId)
  if (!canViewEmployee(scope, plan.employee_id)) return forbidden()

  try {
    const tasks = await listPlanTasks(supabase, orgId, plan.id)
    return NextResponse.json({ data: { plan, tasks } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch plan' },
      { status: 500 },
    )
  }
}
