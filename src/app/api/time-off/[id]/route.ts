import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { forbidden, getViewerScope } from '@/lib/rbac'
import { timeOffDecisionSchema } from '@/lib/validations/time-off'
import {
  approveTimeOffRequest,
  cancelTimeOffRequest,
  rejectTimeOffRequest,
} from '@/modules/hris/domain/time-off'
import type { TimeOffRequest } from '@/lib/types/database'

// PATCH /api/time-off/[id] — approve | reject | cancel.
// approve|reject: admin OR the assigned approver (manager).
// cancel: admin OR the requester themselves OR the assigned approver.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(req, timeOffDecisionSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()

  // Load the request (with employee_id) to evaluate authorization.
  const { data: existing, error: loadErr } = await supabase
    .from('time_off_requests')
    .select('id, employee_id, approver_user_id, status')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Time-off request not found' }, { status: 404 })
  }
  const row = existing as Pick<TimeOffRequest, 'id' | 'employee_id' | 'approver_user_id' | 'status'>

  const scope = await getViewerScope(supabase, orgId, userId)
  const isApprover = row.approver_user_id === userId
  const isRequesterSelf = scope.employeeId === row.employee_id

  if (parsed.action === 'cancel') {
    if (!scope.isAdmin && !isApprover && !isRequesterSelf) return forbidden()
  } else {
    // approve | reject
    if (!scope.isAdmin && !isApprover) return forbidden()
  }

  try {
    const data =
      parsed.action === 'approve' ? await approveTimeOffRequest(supabase, orgId, params.id, { note: parsed.note, decidedBy: userId })
      : parsed.action === 'reject' ? await rejectTimeOffRequest(supabase, orgId, params.id, { note: parsed.note, decidedBy: userId })
      :                              await cancelTimeOffRequest(supabase, orgId, params.id, { note: parsed.note, decidedBy: userId })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update time-off request' },
      { status: 500 },
    )
  }
}
