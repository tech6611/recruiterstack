import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'

// GET /api/me/tax-regime — the calling user's current regime ('new' | 'old')
// or null if they have no employee_profile.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    return NextResponse.json({ data: profile ? { tax_regime: profile.tax_regime } : null })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load regime' },
      { status: 500 },
    )
  }
}

// PUT /api/me/tax-regime — calling user updates their own regime.
// Body: { tax_regime: 'new' | 'old' }
export async function PUT(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  let body: { tax_regime?: 'new' | 'old' }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (body.tax_regime !== 'new' && body.tax_regime !== 'old') {
    return NextResponse.json({ error: 'tax_regime must be "new" or "old"' }, { status: 400 })
  }

  const profile = await getMyEmployeeProfile(supabase, orgId, userId)
  if (!profile) return NextResponse.json({ error: "You don't have an employee profile yet — talk to HR." }, { status: 400 })

  const { data, error } = await supabase
    .from('employee_profiles')
    .update({ tax_regime: body.tax_regime } as never)
    .eq('id', profile.id).eq('org_id', orgId)
    .select('id, tax_regime')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
