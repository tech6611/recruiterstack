import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { forbidden, getViewerScope } from '@/lib/rbac'
import { completeTask } from '@/modules/hris/domain/onboarding'
import type { OnboardingPlan, OnboardingTask } from '@/lib/types/database'

// PATCH /api/hris/onboarding/tasks/[id] — mark a task complete.
// Admin: any task. Non-admin: only tasks assigned to 'new_hire' on a plan
// whose employee is themselves.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()

  // Load the task + its plan to evaluate authorization.
  const { data: taskRow, error: taskErr } = await supabase
    .from('onboarding_tasks')
    .select('id, assignee_role, plan_id')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })
  if (!taskRow) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  const task = taskRow as Pick<OnboardingTask, 'id' | 'assignee_role' | 'plan_id'>

  const scope = await getViewerScope(supabase, orgId, userId)

  if (!scope.isAdmin) {
    // Must be a 'new_hire' task on the calling user's own plan.
    if (task.assignee_role !== 'new_hire') return forbidden()
    const { data: planRow } = await supabase
      .from('onboarding_plans')
      .select('employee_id')
      .eq('id', task.plan_id)
      .eq('org_id', orgId)
      .maybeSingle()
    const plan = planRow as Pick<OnboardingPlan, 'employee_id'> | null
    if (!plan || plan.employee_id !== scope.employeeId) return forbidden()
  }

  try {
    const updated = await completeTask(supabase, orgId, params.id, userId)
    return NextResponse.json({ data: updated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update task' },
      { status: 500 },
    )
  }
}
