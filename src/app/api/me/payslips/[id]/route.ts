import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getMyPayslip } from '@/modules/payroll/domain/payslips'

// GET /api/me/payslips/[id] — one of the calling user's payslips. Returns 404
// (not 403) if the payslip belongs to a different employee — never confirms
// existence across the org boundary.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await getMyPayslip(supabase, orgId, userId, params.id)
    if (!data) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch payslip' },
      { status: 500 },
    )
  }
}
