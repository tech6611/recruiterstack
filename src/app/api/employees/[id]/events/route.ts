import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { listEmployeeEvents } from '@/modules/hris/domain/employees'

// GET /api/employees/[id]/events — the employee's full timeline
// (hired → joined → manager changes → terminations + manual notes).
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listEmployeeEvents(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch employee events' },
      { status: 500 },
    )
  }
}
