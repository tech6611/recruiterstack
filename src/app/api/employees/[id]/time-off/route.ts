import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { timeOffCreateSchema } from '@/lib/validations/time-off'
import { createTimeOffRequest, listTimeOffRequests } from '@/modules/hris/domain/time-off'
import type { TimeOffStatus } from '@/lib/types/database'

const VALID_STATUSES: TimeOffStatus[] = ['pending', 'approved', 'rejected', 'cancelled']

// GET /api/employees/[id]/time-off — list of time-off requests for an employee.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const statusParam = req.nextUrl.searchParams.get('status')
  const status = VALID_STATUSES.includes(statusParam as TimeOffStatus)
    ? (statusParam as TimeOffStatus)
    : undefined

  const supabase = createAdminClient()
  try {
    const data = await listTimeOffRequests(supabase, orgId, { employeeId: params.id, status })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list time-off requests' },
      { status: 500 },
    )
  }
}

// POST /api/employees/[id]/time-off — create a new request for an employee.
// Approver auto-resolves to the requester's manager via the bridge.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const parsed = await parseBody(req, timeOffCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  try {
    const data = await createTimeOffRequest(supabase, orgId, {
      employeeId:  params.id,
      requestType: parsed.request_type,
      startDate:   parsed.start_date,
      endDate:     parsed.end_date,
      hoursTotal:  parsed.hours_total ?? null,
      reason:      parsed.reason      ?? null,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create time-off request' },
      { status: 500 },
    )
  }
}
