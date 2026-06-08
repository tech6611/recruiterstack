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
