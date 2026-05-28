import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'
import { getCurrentCompensation, listCompensationHistory } from '@/modules/hris/domain/compensation'

// GET /api/me/compensation — { current, history } for the calling user.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) return NextResponse.json({ data: { current: null, history: [] } })
    const [current, history] = await Promise.all([
      getCurrentCompensation(supabase, orgId, profile.id),
      listCompensationHistory(supabase, orgId, profile.id),
    ])
    return NextResponse.json({ data: { current, history } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch compensation' },
      { status: 500 },
    )
  }
}
