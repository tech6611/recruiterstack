import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { listRuns, createRun } from '@/modules/payroll/domain/runs'
import type { PayrollRunStatus } from '@/lib/types/database'

const VALID_STATUS: PayrollRunStatus[] = ['draft', 'finalized']

// GET /api/payroll/runs — admin only. Optional status filter.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:view')
  if (guard) return guard

  const sp = req.nextUrl.searchParams
  const statusParam = sp.get('status')
  const status = VALID_STATUS.includes(statusParam as PayrollRunStatus) ? (statusParam as PayrollRunStatus) : undefined

  try {
    const data = await listRuns(supabase, orgId, { status })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list payroll runs' },
      { status: 500 },
    )
  }
}

// POST /api/payroll/runs — admin only. Creates a new draft run.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:edit')
  if (guard) return guard

  let body: { period_start?: string; period_end?: string; pay_date?: string | null; currency?: string; notes?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.period_start || !body.period_end) {
    return NextResponse.json({ error: 'period_start and period_end are required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const data = await createRun(supabase, orgId, {
      period_start: body.period_start,
      period_end:   body.period_end,
      pay_date:     body.pay_date ?? null,
      currency:     body.currency ?? 'INR',
      notes:        body.notes    ?? null,
    })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create payroll run'
    // Duplicate (org, period_start, period_end) → 409
    const status = msg.includes('duplicate key') ? 409 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
