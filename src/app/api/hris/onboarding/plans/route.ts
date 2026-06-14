import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { listPlans } from '@/modules/hris/domain/onboarding'
import type { OnboardingPlanStatus } from '@/lib/types/database'

const VALID: OnboardingPlanStatus[] = ['in_progress', 'completed', 'cancelled']

// GET /api/hris/onboarding/plans — admin only. Returns plans + progress counts.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'onboarding:view')
  if (guard) return guard

  const statusParam = req.nextUrl.searchParams.get('status')
  const status = VALID.includes(statusParam as OnboardingPlanStatus)
    ? (statusParam as OnboardingPlanStatus) : undefined

  try {
    const data = await listPlans(supabase, orgId, status)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list plans' },
      { status: 500 },
    )
  }
}
