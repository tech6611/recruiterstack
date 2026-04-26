import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { compBandCreateSchema } from '@/lib/validations/workspace'

export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const { searchParams } = req.nextUrl
  const level         = searchParams.get('level')
  const departmentId  = searchParams.get('department_id')
  const locationId    = searchParams.get('location_id')
  const includeInactive = searchParams.get('include_inactive') === '1'

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('compensation_bands')
    .select('id, name, level, department_id, location_id, min_salary, max_salary, currency, is_active')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (!includeInactive) q = q.eq('is_active', true)
  if (level)            q = q.eq('level', level)
  if (departmentId)     q = q.eq('department_id', departmentId)
  if (locationId)       q = q.eq('location_id', locationId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, compBandCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('compensation_bands')
    .insert({
      org_id:        auth.orgId,
      name:          body.name,
      level:         body.level,
      department_id: body.department_id ?? null,
      location_id:   body.location_id ?? null,
      min_salary:    body.min_salary,
      max_salary:    body.max_salary,
      currency:      body.currency,
      is_active:     body.is_active,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
