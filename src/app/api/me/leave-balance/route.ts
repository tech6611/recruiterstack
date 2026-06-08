import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'
import { getLeaveBalance } from '@/modules/hris/domain/leave-balances'

// GET /api/me/leave-balance — the calling user's leave balance for current year.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) return NextResponse.json({ data: null })
    const data = await getLeaveBalance(supabase, orgId, profile.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch leave balance' },
      { status: 500 },
    )
  }
}
