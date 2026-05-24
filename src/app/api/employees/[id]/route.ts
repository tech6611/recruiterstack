import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { employeeTransitionSchema } from '@/lib/validations/employees'
import { markEmployeeJoined, markEmployeeTerminated } from '@/lib/domain/employees'

// PATCH /api/employees/[id] — [id] is the employee_profile id.
// "join" flips a pre-hire to active (the hired candidate literally becomes an
// employee — second half of the apply → employee lifecycle); "terminate" ends it.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const parsed = await parseBody(req, employeeTransitionSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  try {
    const data =
      parsed.action === 'join'
        ? await markEmployeeJoined(supabase, orgId, params.id, parsed.start_date)
        : await markEmployeeTerminated(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update employee' },
      { status: 500 },
    )
  }
}
