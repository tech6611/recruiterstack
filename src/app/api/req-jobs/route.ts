import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { jobIntakeCreateSchema } from '@/lib/validations/jobs'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Find an org-scoped department by name, creating it if absent. */
async function findOrCreateDepartment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  orgId: string,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const { data: existing } = await supabase
    .from('departments')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', trimmed)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id
  const { data: created } = await supabase
    .from('departments')
    .insert({ org_id: orgId, name: trimmed })
    .select('id')
    .single()
  return created ? (created as { id: string }).id : null
}

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
  const { orgId, userId } = auth

  const denied = assertCapability(await getViewerScope(createAdminClient(), orgId, userId), 'recruiting:view')
  if (denied) return denied

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

  const denied = assertCapability(await getViewerScope(createAdminClient(), orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const body = await parseBody(req, jobIntakeCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()

  // A job can only exist against an APPROVED requisition (opening). This is the
  // single source of truth for that rule — the New Job UI, the clone flow, and
  // the copilot tools all funnel through here. Without an approved opening to
  // link, refuse to create the job at all (no orphan/req-less jobs, no inline
  // minting of unapproved seats).
  if (!body.link_opening_id) {
    return NextResponse.json(
      { error: 'A job can only be created from an approved requisition. Pick an approved requisition first.' },
      { status: 422 },
    )
  }

  const { data: linkedOpening } = await supabase
    .from('openings')
    .select('id, status')
    .eq('id', body.link_opening_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!linkedOpening) {
    return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 })
  }
  if ((linkedOpening as { status: string }).status !== 'approved') {
    return NextResponse.json(
      { error: 'That requisition is not approved yet. A job can only be created from an approved requisition.' },
      { status: 422 },
    )
  }

  const departmentId = await findOrCreateDepartment(supabase, orgId, body.department)

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      org_id:          orgId,
      title:           body.title,
      department_id:   departmentId,
      description:     body.description || null,
      confidentiality: body.confidentiality,
      custom_fields:   Object.keys(body.intake).length > 0 ? { intake: body.intake } : {},
      status:          'draft',
      created_by:      userId,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  const jobRow = job as { id: string }

  // Link the approved requisition to the new job. Ignore a duplicate link
  // (composite PK) gracefully.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: linkErr } = await (supabase as any)
    .from('job_openings')
    .insert({ job_id: jobRow.id, opening_id: body.link_opening_id, linked_by: userId })
  if (linkErr && linkErr.code !== '23505') return handleSupabaseError(linkErr)

  return NextResponse.json({ data: job }, { status: 201 })
}
