import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { listHolidays } from '@/modules/hris/domain/leave-balances'

// GET /api/me/holidays — upcoming holidays for the org (from today onwards).
// Everyone in the org sees this; no RBAC scope beyond requireOrgAndUser.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const today = new Date().toISOString().slice(0, 10)
  const supabase = createAdminClient()
  try {
    const data = await listHolidays(supabase, orgId, { from: today, limit: 50 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch holidays' },
      { status: 500 },
    )
  }
}
