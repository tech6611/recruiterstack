import { NextRequest, NextResponse } from 'next/server'
import { confidentialFilter, jobVisible } from '@/lib/jobs/confidential'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { jobIntakeCreateSchema } from '@/lib/validations/jobs'
import { findOrCreateLocation, syncJobLocationIntakeMirror } from '@/lib/jobs/inherit'
import { getJobTemplate, applyJobTemplateToJob } from '@/modules/ats/domain/job-templates'
import { logger } from '@/lib/logger'
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

  const scope = await getViewerScope(createAdminClient(), orgId, userId)
  const denied = assertCapability(scope, 'recruiting:view')
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
  // Confidential jobs: only admins, the creator, and people with a role on the job.
  const cf = await confidentialFilter(supabase, orgId, scope)
  const visible = ((data ?? []) as Array<{ id: string; confidentiality?: string | null }>).filter(j => jobVisible(cf, j))
  const hidden = (data?.length ?? 0) - visible.length

  // Eager load linked openings count for the list display.
  const ids = visible.map(j => j.id)
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
    data: visible.map(j => ({ ...j, opening_count: counts.get(j.id) ?? 0 })),
    count: Math.max(0, (count ?? 0) - hidden),
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
    .select('id, status, hiring_manager_id, hiring_manager_name, hiring_manager_email, comp_min, comp_max, comp_currency, location_id')
    .eq('id', body.link_opening_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!linkedOpening) {
    return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 })
  }
  const opening = linkedOpening as {
    status: string
    hiring_manager_id: string | null
    hiring_manager_name: string | null
    hiring_manager_email: string | null
    comp_min: number | null; comp_max: number | null; comp_currency: string | null; location_id: string | null
  }
  if (opening.status !== 'approved') {
    return NextResponse.json(
      { error: 'That requisition is not approved yet. A job can only be created from an approved requisition.' },
      { status: 422 },
    )
  }

  const departmentId = await findOrCreateDepartment(supabase, orgId, body.department)

  // Flow the hiring manager down from the approved requisition: the account link
  // (jobs.hiring_manager_user_id — gates job access + routes plan approvals; the
  // Overview picker can override it later) and the name/email onto the job's
  // top-level custom_fields — this is the single place the {{hiring_manager_calendar}}
  // token reads from. A user-edited value in the intake payload (hm_name/hm_email)
  // wins over the requisition's default so "same HM by default, editable" holds.
  const intake = body.intake as Record<string, unknown>
  const hmName  = (typeof intake.hm_name  === 'string' && intake.hm_name.trim())  || opening.hiring_manager_name  || null
  const hmEmail = (typeof intake.hm_email === 'string' && intake.hm_email.trim()) || opening.hiring_manager_email || null
  const customFields: Record<string, unknown> = {}
  if (Object.keys(body.intake).length > 0) customFields.intake = body.intake
  if (hmName)  customFields.hiring_manager_name  = hmName
  if (hmEmail) customFields.hiring_manager_email = hmEmail

  // Comp + location: what the recruiter typed wins, else inherit from the requisition
  // (migration 144). Location text from the form is matched/created in `locations`.
  const compMin = body.comp_min ?? opening.comp_min ?? null
  const compMax = body.comp_max ?? opening.comp_max ?? null
  const compCurrency = body.comp_currency ?? opening.comp_currency ?? null
  const locationId = body.location_id
    ?? (await findOrCreateLocation(supabase, orgId, typeof intake.location === 'string' ? intake.location : null))
    ?? opening.location_id ?? null

  const baseRow = {
    org_id:          orgId,
    title:           body.title,
    department_id:   departmentId,
    description:     body.description || null,
    confidentiality: body.confidentiality,
    custom_fields:   customFields,
    status:          'draft',
    created_by:      userId,
    hiring_manager_user_id: opening.hiring_manager_id ?? null,
  }
  let inserted = await supabase
    .from('jobs')
    .insert({ ...baseRow, comp_min: compMin, comp_max: compMax, comp_currency: compCurrency, location_id: locationId } as never)
    .select()
    .single()
  // Pre-migration-144 database: retry without the new columns.
  if (inserted.error?.code === '42703') {
    inserted = await supabase.from('jobs').insert(baseRow as never).select().single()
  }
  const { data: job, error } = inserted

  if (error) return handleSupabaseError(error)
  const jobRow = job as { id: string }
  await syncJobLocationIntakeMirror(supabase, orgId, jobRow.id)

  // Link the approved requisition to the new job. Ignore a duplicate link
  // (composite PK) gracefully.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: linkErr } = await (supabase as any)
    .from('job_openings')
    .insert({ job_id: jobRow.id, opening_id: body.link_opening_id, linked_by: userId })
  if (linkErr && linkErr.code !== '23505') return handleSupabaseError(linkErr)

  // Started from a job template? Apply its linked pieces (interview-plan
  // template + draft posting) now that the job exists. The scalar fields were
  // prefilled client-side so the recruiter could edit them before creating.
  // Best-effort: the job is already created, so a template hiccup is logged,
  // not surfaced as a failed create.
  const templateId = 'template_id' in body && typeof body.template_id === 'string' ? body.template_id : null
  if (templateId) {
    try {
      const template = await getJobTemplate(supabase, orgId, templateId)
      if (template) await applyJobTemplateToJob(supabase, orgId, jobRow.id, template, userId)
      else logger.warn('[req-jobs] template not found for org; skipped', { templateId, jobId: jobRow.id })
    } catch (err) {
      logger.warn('[req-jobs] apply job template failed', { templateId, jobId: jobRow.id, err })
    }
  }

  return NextResponse.json({ data: job }, { status: 201 })
}
