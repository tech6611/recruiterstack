import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

/**
 * GET /api/compensation-bands
 *
 * Optional filters: level, department_id, location_id.
 * Used by the opening form to auto-fill comp_min/max from the matching band.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const { searchParams } = req.nextUrl
  const level         = searchParams.get('level')
  const departmentId  = searchParams.get('department_id')
  const locationId    = searchParams.get('location_id')

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('compensation_bands')
    .select('id, name, level, department_id, location_id, min_salary, max_salary, currency, is_active')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (level)        q = q.eq('level', level)
  if (departmentId) q = q.eq('department_id', departmentId)
  if (locationId)   q = q.eq('location_id', locationId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
