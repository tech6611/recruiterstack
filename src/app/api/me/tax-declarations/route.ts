import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'
import { listDeclarationsForEmployee, upsertDeclaration } from '@/modules/payroll/domain/declarations'

// GET /api/me/tax-declarations — calling user's own declarations across FYs.
// Empty array if the user has no linked employee_profile.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) return NextResponse.json({ data: [] })
    const data = await listDeclarationsForEmployee(supabase, orgId, profile.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch declarations' },
      { status: 500 },
    )
  }
}

// PUT /api/me/tax-declarations — the calling user updates their own declaration
// for a specific FY. We never let one user touch another's row.
export async function PUT(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
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
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) {
      return NextResponse.json({ error: "You don't have an employee profile yet — talk to HR." }, { status: 400 })
    }
    const data = await upsertDeclaration(supabase, orgId, profile.id, {
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

// Whitelist known v1.1 keys and coerce values to non-negative numbers. Unknown
// keys are dropped — keeps a hostile client from packing arbitrary jsonb into
// the column. New engine sections add to this list.
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
