import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { openingCreateSchema } from '@/lib/validations/openings'
import { createOpening } from '@/modules/ats/domain/openings'
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
  const { orgId, userId } = authResult

  const denied = assertCapability(await getViewerScope(createAdminClient(), orgId, userId), 'openings:view')
  if (denied) return denied

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

  const denied = assertCapability(await getViewerScope(createAdminClient(), orgId, userId), 'openings:edit')
  if (denied) return denied

  const body = await parseBody(req, openingCreateSchema)
  if (body instanceof NextResponse) return body

  // Insert hides behind the canonical facade so the copilot `create_opening`
  // tool and this route share one code path (out_of_band computation included).
  const supabase = createAdminClient()
  try {
    const data = await createOpening(supabase, orgId, userId, body)
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    return handleSupabaseError(error as { code: string; message: string })
  }
}
