import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { listPayslipsForRun, upsertPayslip } from '@/modules/payroll/domain/payslips'
import type { PayslipBreakdown } from '@/lib/types/database'

// GET /api/payroll/runs/[id]/payslips — admin only.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  try {
    const data = await listPayslipsForRun(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list payslips' },
      { status: 500 },
    )
  }
}

// PUT /api/payroll/runs/[id]/payslips — admin only.
// Upsert one payslip for (run, employee). Use the same endpoint for create
// and update; (run_id, employee_id) is the unique key.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  let body: {
    employee_id?:      string
    gross?:            number
    deductions_total?: number
    net?:              number
    breakdown?:        PayslipBreakdown
    notes?:            string | null
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.employee_id || typeof body.gross !== 'number' || typeof body.deductions_total !== 'number' || typeof body.net !== 'number') {
    return NextResponse.json({ error: 'employee_id, gross, deductions_total, net are required' }, { status: 400 })
  }

  try {
    const data = await upsertPayslip(supabase, orgId, params.id, {
      employee_id:      body.employee_id,
      gross:            body.gross,
      deductions_total: body.deductions_total,
      net:              body.net,
      breakdown:        body.breakdown,
      notes:            body.notes ?? null,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save payslip' },
      { status: 400 },
    )
  }
}
