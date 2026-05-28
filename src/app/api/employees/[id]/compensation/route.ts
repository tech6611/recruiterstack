import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertAdmin, assertCanViewSensitive, getViewerScope } from '@/lib/rbac'
import { compensationInsertSchema } from '@/lib/validations/employees'
import {
  getCurrentCompensation,
  listCompensationHistory,
  recordCompensation,
} from '@/modules/hris/domain/compensation'

// GET /api/employees/[id]/compensation — admin or self only (sensitive).
// Returns { current, history }.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCanViewSensitive(scope, params.id)
  if (guard) return guard

  try {
    const [current, history] = await Promise.all([
      getCurrentCompensation(supabase, orgId, params.id),
      listCompensationHistory(supabase, orgId, params.id),
    ])
    return NextResponse.json({ data: { current, history } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch compensation' },
      { status: 500 },
    )
  }
}

// POST /api/employees/[id]/compensation — admin only. Immutable history:
// corrections go in as a new corrective record, never as an update.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const parsed = await parseBody(req, compensationInsertSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await recordCompensation(supabase, orgId, {
      employeeId:       params.id,
      effectiveDate:    parsed.effective_date,
      baseSalary:       parsed.base_salary,
      currency:         parsed.currency,
      payFrequency:     parsed.pay_frequency,
      bonusAmount:      parsed.bonus_amount ?? null,
      equityNotes:      parsed.equity_notes ?? null,
      variablePayNotes: parsed.variable_pay_notes ?? null,
      reason:           parsed.reason ?? null,
      recordedBy:       'api',
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record compensation' },
      { status: 500 },
    )
  }
}
