import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'

// PUT /api/payroll/employees/[id]/regime — admin only. Sets the employee's
// tax_regime ('new' | 'old'). Lives under payroll/ because the regime is a
// payroll concern even though the column is on employee_profiles.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:edit')
  if (guard) return guard

  let body: { tax_regime?: 'new' | 'old' }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (body.tax_regime !== 'new' && body.tax_regime !== 'old') {
    return NextResponse.json({ error: 'tax_regime must be "new" or "old"' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('employee_profiles')
    .update({ tax_regime: body.tax_regime } as never)
    .eq('id', params.id).eq('org_id', orgId)
    .select('id, tax_regime')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
