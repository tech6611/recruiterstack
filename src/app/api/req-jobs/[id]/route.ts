import { NextRequest, NextResponse } from 'next/server'
import { canSeeJob } from '@/lib/jobs/confidential'
import { archiveEntity } from '@/lib/openings/seats'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { jobUpdateSchema } from '@/lib/validations/jobs'
import { updateCanonicalJob } from '@/modules/ats/domain/job-pipelines'
import { syncActiveIcpLocationsFromJob } from '@/modules/ats/domain/icp'
import { maybeTriggerReapproval } from '@/lib/jobs/reapproval'
import { findOrCreateLocation, syncJobLocationIntakeMirror } from '@/lib/jobs/inherit'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, 'recruiting:view')
  if (denied) return denied

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()
  if (error) return handleSupabaseError(error)
  // Confidential jobs read as 'not found' for anyone not on them.
  if (!(await canSeeJob(supabase, orgId, scope, data as { id: string; confidentiality?: string | null }))) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  return NextResponse.json({ data })
}

// Job-level location + comp (migration 144): editable at any status. On a DB
// that hasn't run the migration yet, Postgres rejects the unknown columns with
// 42703 (undefined_column) — retry the write without them so the rest lands.
const JOB_ATTRIBUTE_KEYS = ['location_id', 'comp_min', 'comp_max', 'comp_currency'] as const
type JobAttributeKey = typeof JOB_ATTRIBUTE_KEYS[number]

async function updateJobTolerant(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<{ code: string; message: string } | null> {
  const { error } = await supabase.from('jobs').update(patch).eq('id', jobId).eq('org_id', orgId)
  if (!error) return null
  const hasAttrs = JOB_ATTRIBUTE_KEYS.some(k => k in patch)
  if (error.code !== '42703' || !hasAttrs) return error
  const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !(JOB_ATTRIBUTE_KEYS as readonly string[]).includes(k)))
  if (Object.keys(rest).length === 0) return null
  const retry = await supabase.from('jobs').update(rest).eq('id', jobId).eq('org_id', orgId)
  return retry.error ?? null
}

/** PATCH — identity fields only while status='draft'; JD, location/comp, status and custom_fields at any status. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const body = await parseBody(req, jobUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const { data: existing } = await supabase
    .from('jobs').select('id, status').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  const row = existing as { id: string; status: string } | null
  if (!row) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Board-level edits (status transitions like the HM approve action, and
  // custom_fields writes like scoring_criteria / hiring_manager_*) are allowed on
  // any status. The strict draft-only gate protects the *identity* fields that an
  // org wants frozen once a requisition is approved (title/department/team/
  // confidentiality). The JD body (`description`) is deliberately editable at any
  // status — recruiters keep refining the posting after approval — so it's pulled
  // out of the structural set and written on the always-allowed path below.
  // Location + comp are job attributes, not identity — they're inherited from
  // the requisition and may be overridden at any status, so they're split out
  // of the structural set and written alongside the JD.
  const { status, custom_fields, description, location_id, comp_min, comp_max, comp_currency, ...structural } = body
  const intakeLocation = typeof (custom_fields as { intake?: { location?: unknown } } | undefined)?.intake?.location === 'string'
    ? (custom_fields as { intake: { location: string } }).intake.location
    : null
  const resolvedLocationId = location_id !== undefined
    ? location_id
    : intakeLocation != null
      ? await findOrCreateLocation(supabase, orgId, intakeLocation)
      : undefined
  const attributes: Partial<Record<JobAttributeKey, unknown>> = {}
  if (resolvedLocationId !== undefined) attributes.location_id = resolvedLocationId
  if (comp_min      !== undefined) attributes.comp_min      = comp_min
  if (comp_max      !== undefined) attributes.comp_max      = comp_max
  if (comp_currency !== undefined) attributes.comp_currency = comp_currency
  const editsStructuralFields = Object.keys(structural).length > 0
  if (editsStructuralFields && row.status !== 'draft') {
    return NextResponse.json({ error: `Cannot edit a job with status '${row.status}'.` }, { status: 409 })
  }

  // ── Apply the write ──────────────────────────────────────────────────────
  // custom_fields must MERGE into the existing JSONB, so route the write through
  // the domain facade (read-then-write merge) rather than overwriting the column.
  // The board writers only send status + custom_fields (never the structural
  // edit-form fields), so any structural fields are written by the regular path.
  if (custom_fields !== undefined) {
    const directWrite: Record<string, unknown> = { ...structural, ...attributes }
    if (description !== undefined) directWrite.description = description
    if (Object.keys(directWrite).length > 0) {
      const error = await updateJobTolerant(supabase, orgId, params.id, directWrite)
      if (error) return handleSupabaseError(error)
    }
    try {
      await updateCanonicalJob(supabase, orgId, params.id, { status, custom_fields })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  } else {
    const directWrite: Record<string, unknown> = { ...structural, ...attributes }
    if (description !== undefined) directWrite.description = description
    if (status !== undefined) directWrite.status = status
    if (Object.keys(directWrite).length > 0) {
      const error = await updateJobTolerant(supabase, orgId, params.id, directWrite)
      if (error) return handleSupabaseError(error)
    }
  }

  // A legacy intake write is allowed for compatibility, but it cannot become a
  // competing market. Mirror the canonical location back after either entry path.
  if (resolvedLocationId !== undefined) {
    await syncJobLocationIntakeMirror(supabase, orgId, params.id)
    await syncActiveIcpLocationsFromJob(supabase, orgId, params.id)
  }

  // ── Re-approval gate ─────────────────────────────────────────────────────
  // If this edit changed the WORDING of the approved substance (JD / key
  // requirements / nice-to-haves / level / what-they'll-do) on an approved or
  // live job, re-run the approval workflow. Formatting-only edits pass through.
  const { data: updated, error: readErr } = await supabase
    .from('jobs').select('*').eq('id', params.id).eq('org_id', orgId).single()
  if (readErr) return handleSupabaseError(readErr)

  const reapproval = await maybeTriggerReapproval(supabase, orgId, userId, updated, row.status)

  // The gate may have changed status/approval_id — re-read for an accurate row.
  if (reapproval.reapproval || reapproval.reapproval_skipped) {
    const { data: finalData, error: finalErr } = await supabase
      .from('jobs').select().eq('id', params.id).eq('org_id', orgId).single()
    if (finalErr) return handleSupabaseError(finalErr)
    return NextResponse.json({ data: finalData, reapproval })
  }
  return NextResponse.json({ data: updated, reapproval })
}

/** DELETE — soft-archive (status='archived'). */
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const ok = await archiveEntity(supabase, orgId, 'jobs', params.id, userId)
  if (!ok) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const { data, error } = await supabase.from('jobs').select('*').eq('id', params.id).eq('org_id', orgId).single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
