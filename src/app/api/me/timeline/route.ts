import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getMyEmployeeProfile, listEmployeeEvents } from '@/modules/hris/domain/employees'

// GET /api/me/timeline — the calling user's own employment timeline.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) return NextResponse.json({ data: [] })
    const data = await listEmployeeEvents(supabase, orgId, profile.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch timeline' },
      { status: 500 },
    )
  }
}
