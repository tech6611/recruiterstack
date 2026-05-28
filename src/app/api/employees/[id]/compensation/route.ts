import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { compensationInsertSchema } from '@/lib/validations/employees'
import {
  getCurrentCompensation,
  listCompensationHistory,
  recordCompensation,
} from '@/modules/hris/domain/compensation'

// GET /api/employees/[id]/compensation
// Returns { current, history } — current = most recent record by effective_date,
// history = all records (newest first).
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
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

// POST /api/employees/[id]/compensation — record a new comp. Immutable history:
// corrections go in as a new corrective record, never as an update.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const parsed = await parseBody(req, compensationInsertSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
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
