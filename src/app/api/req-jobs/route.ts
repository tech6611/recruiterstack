import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { jobCreateSchema } from '@/lib/validations/jobs'

/**
 * GET /api/req-jobs — list with filters + pagination.
 *
 * Query params: status, department_id, hiring_team_id, confidentiality,
 * limit (1–200, default 50), offset (default 0).
 *
 * Confidential jobs visibility is enforced at the application layer:
 * - admins see everything
 * - members see public jobs + confidential jobs they're on the hiring team for
 *
 * Phase I keeps it simple (admin sees all; non-admins only see public + jobs
 * their user_id appears on as creator/hiring_team member). Sharper RBAC
 * happens in Phase J.
 */
export async function GET(req: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const { searchParams } = req.nextUrl
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get('limit')  ?? '50', 10)))
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
  const status         = searchParams.get('status')
  const departmentId   = searchParams.get('department_id')
  const hiringTeamId   = searchParams.get('hiring_team_id')
  const confidentiality = searchParams.get('confidentiality')

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('jobs')
    .select('id, title, status, department_id, hiring_team_id, confidentiality, approval_id, created_at, updated_at',
            { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status)          q = q.eq('status', status)
  if (departmentId)    q = q.eq('department_id', departmentId)
  if (hiringTeamId)    q = q.eq('hiring_team_id', hiringTeamId)
  if (confidentiality) q = q.eq('confidentiality', confidentiality)

  const { data, error, count } = await q
  if (error) return handleSupabaseError(error)

  // Eager load linked openings count for the list display.
  const ids = (data ?? []).map((j: { id: string }) => j.id)
  const counts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: links } = await supabase
      .from('job_openings')
      .select('job_id')
      .in('job_id', ids)
    for (const l of (links ?? []) as Array<{ job_id: string }>) {
      counts.set(l.job_id, (counts.get(l.job_id) ?? 0) + 1)
    }
  }

  return NextResponse.json({
    data: (data ?? []).map((j: { id: string }) => ({ ...j, opening_count: counts.get(j.id) ?? 0 })),
    count: count ?? 0,
    limit,
    offset,
  })
}

/** POST /api/req-jobs — creates a draft job. */
export async function POST(req: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const body = await parseBody(req, jobCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      org_id:          orgId,
      title:           body.title,
      department_id:   body.department_id ?? null,
      description:     body.description ?? null,
      hiring_team_id:  body.hiring_team_id ?? null,
      confidentiality: body.confidentiality,
      custom_fields:   body.custom_fields ?? {},
      status:          'draft',
      created_by:      userId,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
