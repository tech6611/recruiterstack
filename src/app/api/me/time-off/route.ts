import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { timeOffCreateSchema } from '@/lib/validations/time-off'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'
import { createTimeOffRequest, listTimeOffRequests } from '@/modules/hris/domain/time-off'

// GET /api/me/time-off — the calling user's own time-off requests.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) return NextResponse.json({ data: [] })
    const data = await listTimeOffRequests(supabase, orgId, { employeeId: profile.id })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch time-off' },
      { status: 500 },
    )
  }
}

// POST /api/me/time-off — submit a time-off request for myself. Approver
// auto-resolves to my manager via the bridge from migration 050.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(req, timeOffCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) {
      return NextResponse.json(
        { error: 'You have no employee record in this org. Ask HR to add one before requesting time off.' },
        { status: 403 },
      )
    }
    const data = await createTimeOffRequest(supabase, orgId, {
      employeeId:  profile.id,
      requestType: parsed.request_type,
      startDate:   parsed.start_date,
      endDate:     parsed.end_date,
      hoursTotal:  parsed.hours_total ?? null,
      reason:      parsed.reason      ?? null,
      requestedBy: userId,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit request' },
      { status: 500 },
    )
  }
}
