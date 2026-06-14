import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { listCases } from '@/modules/hris/domain/cases'
import type { HrCaseCategory, HrCaseStatus } from '@/lib/types/database'

const VALID_STATUS:   HrCaseStatus[]   = ['open', 'in_progress', 'resolved', 'closed']
const VALID_CATEGORY: HrCaseCategory[] = ['leave', 'comp', 'benefits', 'docs', 'manager', 'onboarding', 'other']

// GET /api/hris/cases — admin-only list, optional status + category filters.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'hr_cases:view')
  if (guard) return guard

  const sp = req.nextUrl.searchParams
  const status   = VALID_STATUS.includes(sp.get('status') as HrCaseStatus)     ? (sp.get('status') as HrCaseStatus)     : undefined
  const category = VALID_CATEGORY.includes(sp.get('category') as HrCaseCategory) ? (sp.get('category') as HrCaseCategory) : undefined

  try {
    const data = await listCases(supabase, orgId, { status, category })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list cases' },
      { status: 500 },
    )
  }
}
