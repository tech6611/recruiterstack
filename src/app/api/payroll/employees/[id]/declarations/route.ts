import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { listDeclarationsForEmployee, upsertDeclaration } from '@/modules/payroll/domain/declarations'

// GET /api/payroll/employees/[id]/declarations — admin only.
// Lists every FY declaration the employee has on file (newest first).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
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
  const guard = assertAdmin(scope)
  if (guard) return guard

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
    const data = await upsertDeclaration(supabase, orgId, params.id, {
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
