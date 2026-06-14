import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { listDeclarationsForEmployee, upsertDeclaration } from '@/modules/payroll/domain/declarations'

// GET /api/payroll/employees/[id]/declarations — admin only.
// Lists every FY declaration the employee has on file (newest first).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:view')
  if (guard) return guard

  try {
    const data = await listDeclarationsForEmployee(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list declarations' },
      { status: 500 },
    )
  }
}

// PUT /api/payroll/employees/[id]/declarations — admin only.
// Body: { fy, rent_paid_annual?, section_80c?, section_80d?, section_80ccd_1b?, notes? }
// Idempotent on (employee, fy).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:edit')
  if (guard) return guard

  let body: {
    fy?: string
    rent_paid_annual?: number
    section_80c?: number
    section_80d?: number
    section_80ccd_1b?: number
    other_exemptions?: Record<string, number>
    notes?: string | null
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.fy) return NextResponse.json({ error: 'fy is required (e.g. "2026-27")' }, { status: 400 })

  try {
    const data = await upsertDeclaration(supabase, orgId, params.id, {
      fy:               body.fy,
      rent_paid_annual: body.rent_paid_annual,
      section_80c:      body.section_80c,
      section_80d:      body.section_80d,
      section_80ccd_1b: body.section_80ccd_1b,
      other_exemptions: sanitizeOtherExemptions(body.other_exemptions),
      notes:            body.notes,
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save declaration' },
      { status: 400 },
    )
  }
}

// Whitelist known v1.1 exemption keys; drop anything else. Keeps the open jsonb
// column from being weaponised by a misbehaving client.
// Amount keys → must be > 0 to be stored. Flag keys → store as 1 only if truthy.
const AMOUNT_KEYS = ['24b', '80e', '80g', '80tta', '80u', '80dd', '80ddb'] as const
const FLAG_KEYS   = ['80u_severe', '80dd_severe', '80ddb_senior']           as const
function sanitizeOtherExemptions(raw: Record<string, number> | undefined): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const k of AMOUNT_KEYS) {
    const v = Number(raw[k])
    if (Number.isFinite(v) && v > 0) out[k] = v
  }
  for (const k of FLAG_KEYS) {
    if (Number(raw[k]) > 0) out[k] = 1
  }
  return out
}
