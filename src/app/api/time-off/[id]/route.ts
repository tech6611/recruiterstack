import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { timeOffDecisionSchema } from '@/lib/validations/time-off'
import {
  approveTimeOffRequest,
  cancelTimeOffRequest,
  rejectTimeOffRequest,
} from '@/modules/hris/domain/time-off'

// PATCH /api/time-off/[id] — decide on a request (approve | reject | cancel).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const parsed = await parseBody(req, timeOffDecisionSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  try {
    const data =
      parsed.action === 'approve' ? await approveTimeOffRequest(supabase, orgId, params.id, { note: parsed.note })
      : parsed.action === 'reject' ? await rejectTimeOffRequest(supabase, orgId, params.id, { note: parsed.note })
      :                              await cancelTimeOffRequest(supabase, orgId, params.id, { note: parsed.note })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update time-off request' },
      { status: 500 },
    )
  }
}
