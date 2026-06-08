import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { listMyOnboardingTasks } from '@/modules/hris/domain/onboarding'

// GET /api/me/onboarding — the calling user's own onboarding plan + their
// 'new_hire'-assigned tasks. Returns { plan: null, tasks: [] } when the user
// has no employee_profile bridged yet, or no active plan.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listMyOnboardingTasks(supabase, orgId, userId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch onboarding' },
      { status: 500 },
    )
  }
}
