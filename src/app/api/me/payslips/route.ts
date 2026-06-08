import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { listMyPayslips } from '@/modules/payroll/domain/payslips'

// GET /api/me/payslips — the calling user's payslip history. Returns [] if the
// user has no linked employee_profile (e.g. an admin who was never hired via
// the ATS flow). User can only see payslips for runs that are finalized OR
// drafts they're already in — we leave that filtering off in v0 since both
// are theirs anyway.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const data = await listMyPayslips(supabase, orgId, userId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch payslips' },
      { status: 500 },
    )
  }
}
