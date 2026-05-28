import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { listOrgChart } from '@/modules/hris/domain/employees'

// GET /api/hris/org-chart — flat list of all live (pending + active) employees
// with manager_id. The page builds the tree client-side.
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listOrgChart(supabase, orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch org chart' },
      { status: 500 },
    )
  }
}
