import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { getRun, updateRun, finalizeRun, deleteRun } from '@/modules/payroll/domain/runs'
import { listPayslipsForRun } from '@/modules/payroll/domain/payslips'

// GET /api/payroll/runs/[id] — admin only. Returns the run + its payslips.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  try {
    const run = await getRun(supabase, orgId, params.id)
    if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
    const payslips = await listPayslipsForRun(supabase, orgId, params.id)
    return NextResponse.json({ data: { ...run, payslips } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load payroll run' },
      { status: 500 },
    )
  }
}

// PATCH /api/payroll/runs/[id] — admin only.
// Two operations on one resource:
//   { action: 'finalize' } → finalizes the run (no other fields allowed)
//   anything else          → updates period/notes/pay_date/currency
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  let body: { action?: 'finalize'; period_start?: string; period_end?: string; pay_date?: string | null; currency?: string; notes?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  try {
    if (body.action === 'finalize') {
      const data = await finalizeRun(supabase, orgId, params.id, userId)
      return NextResponse.json({ data })
    }
    const data = await updateRun(supabase, orgId, params.id, {
      period_start: body.period_start,
      period_end:   body.period_end,
      pay_date:     body.pay_date,
      currency:     body.currency,
      notes:        body.notes,
    })
    return NextResponse.json({ data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update payroll run'
    const status = msg.includes('not found') ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

// DELETE /api/payroll/runs/[id] — admin only. Refuses on finalized runs.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  try {
    await deleteRun(supabase, orgId, params.id)
    return NextResponse.json({ data: { id: params.id } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete payroll run' },
      { status: 400 },
    )
  }
}
