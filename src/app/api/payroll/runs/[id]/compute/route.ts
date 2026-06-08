import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { planRunCompute, writeRunCompute } from '@/modules/payroll/domain/compute'

// POST /api/payroll/runs/[id]/compute — admin only.
// Body: { preview?: boolean; preserveExisting?: boolean }
//   preview=true (default) returns the plan without writing — UI shows it
//                 in a confirmation modal.
//   preview=false materialises the plan into payslip rows.
//   preserveExisting=true (default) leaves existing payslips alone; false
//                 overwrites them (admin-explicit recompute).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  let body: { preview?: boolean; preserveExisting?: boolean } = {}
  try { body = await req.json() } catch { /* empty body OK — treat as preview */ }
  const preview          = body.preview          ?? true
  const preserveExisting = body.preserveExisting ?? true

  try {
    const plan = await planRunCompute(supabase, orgId, params.id)
    if (preview) {
      return NextResponse.json({ data: { plan, write: null } })
    }
    const write = await writeRunCompute(supabase, orgId, plan, { preserveExisting })
    return NextResponse.json({ data: { plan, write } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Compute failed'
    const status = msg.includes('not found') ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
