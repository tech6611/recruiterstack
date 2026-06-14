import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { deletePayslip, getPayslip } from '@/modules/payroll/domain/payslips'

// GET /api/payroll/runs/[id]/payslips/[payslipId] — admin only.
// The runId path segment is informational; lookup uses (org, payslipId).
export async function GET(_req: NextRequest, { params }: { params: { id: string; payslipId: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:view')
  if (guard) return guard

  try {
    const data = await getPayslip(supabase, orgId, params.payslipId)
    if (!data) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
    if (data.run_id !== params.id) return NextResponse.json({ error: 'Payslip does not belong to this run' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load payslip' },
      { status: 500 },
    )
  }
}

// DELETE /api/payroll/runs/[id]/payslips/[payslipId] — admin only.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; payslipId: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:edit')
  if (guard) return guard

  try {
    await deletePayslip(supabase, orgId, params.payslipId)
    return NextResponse.json({ data: { id: params.payslipId } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete payslip' },
      { status: 400 },
    )
  }
}
