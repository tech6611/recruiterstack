import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { openingCreateSchema } from '@/lib/validations/openings'
import type { Opening } from '@/lib/types/requisitions'

type StatusFilter = Opening['status']

/**
 * GET /api/openings — list with filters + offset/limit pagination.
 *
 * Query params:
 *   status, department_id, location_id, hiring_manager_id, recruiter_id
 *   limit (1–200, default 50), offset (default 0)
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const { searchParams } = req.nextUrl
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get('limit')  ?? '50', 10)))
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  const statusParam       = searchParams.get('status')
  const departmentId      = searchParams.get('department_id')
  const locationId        = searchParams.get('location_id')
  const hiringManagerId   = searchParams.get('hiring_manager_id')
  const recruiterId       = searchParams.get('recruiter_id')

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('openings')
    .select(
      'id, title, status, employment_type, target_start_date, out_of_band, ' +
      'comp_min, comp_max, comp_currency, ' +
      'department_id, location_id, hiring_manager_id, recruiter_id, ' +
      'created_at, updated_at',
      { count: 'exact' },
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (statusParam)     q = q.eq('status', statusParam as StatusFilter)
  if (departmentId)    q = q.eq('department_id', departmentId)
  if (locationId)      q = q.eq('location_id', locationId)
  if (hiringManagerId) q = q.eq('hiring_manager_id', hiringManagerId)
  if (recruiterId)     q = q.eq('recruiter_id', recruiterId)

  const { data, error, count } = await q
  if (error) return handleSupabaseError(error)

  return NextResponse.json({ data: data ?? [], count: count ?? 0, limit, offset })
}

/**
 * POST /api/openings — creates a draft opening.
 * status is always 'draft' on create; use /submit (Phase F) to move to pending_approval.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const body = await parseBody(req, openingCreateSchema)
  if (body instanceof NextResponse) return body

  // If the user supplied a comp_band_id, compute out_of_band by comparing
  // to the linked band's range. If comp values match the band, out_of_band=false.
  const supabase = createAdminClient()
  let outOfBand = body.out_of_band
  if (body.comp_band_id && (body.comp_min !== null || body.comp_max !== null)) {
    const { data: band } = await supabase
      .from('compensation_bands')
      .select('min_salary, max_salary')
      .eq('id', body.comp_band_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (band) {
      const b = band as { min_salary: number; max_salary: number }
      const minOut = body.comp_min !== null && Number(body.comp_min) < b.min_salary
      const maxOut = body.comp_max !== null && Number(body.comp_max) > b.max_salary
      outOfBand = minOut || maxOut
    }
  }

  const { data, error } = await supabase
    .from('openings')
    .insert({
      org_id:            orgId,
      title:             body.title,
      department_id:     body.department_id ?? null,
      location_id:       body.location_id ?? null,
      employment_type:   body.employment_type,
      comp_min:          body.comp_min,
      comp_max:          body.comp_max,
      comp_currency:     body.comp_currency,
      comp_band_id:      body.comp_band_id ?? null,
      out_of_band:       outOfBand,
      target_start_date: body.target_start_date,
      hiring_manager_id: body.hiring_manager_id ?? null,
      recruiter_id:      body.recruiter_id ?? userId,          // default: current user
      justification:     body.justification ?? null,
      external_id:       body.external_id ?? null,
      custom_fields:     body.custom_fields ?? {},
      status:            'draft',
      created_by:        userId,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
