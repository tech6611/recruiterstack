import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertAdmin, getViewerScope } from '@/lib/rbac'

// PUT /api/employees/[id]/dob — admin only. Sets / clears date_of_birth.
// Body: { date_of_birth: 'YYYY-MM-DD' | null }
//
// DOB is sensitive (age can be a hiring-bias proxy and surfaces in retirement
// math). Admin-only matches our other employee-record edits.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  let body: { date_of_birth?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // null clears; otherwise must be YYYY-MM-DD and in the past.
  const dob = body.date_of_birth ?? null
  if (dob !== null) {
    if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      return NextResponse.json({ error: 'date_of_birth must be YYYY-MM-DD or null' }, { status: 400 })
    }
    const t = Date.parse(dob + 'T00:00:00Z')
    if (!Number.isFinite(t)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    if (t > Date.now())      return NextResponse.json({ error: 'date_of_birth cannot be in the future' }, { status: 400 })
    // 120-year sanity floor (the oldest employee on record is ~120 y/o).
    if (t < Date.UTC(new Date().getUTCFullYear() - 120, 0, 1)) {
      return NextResponse.json({ error: 'date_of_birth is too far in the past' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('employee_profiles')
    .update({ date_of_birth: dob } as never)
    .eq('id', params.id).eq('org_id', orgId)
    .select('id, date_of_birth')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
