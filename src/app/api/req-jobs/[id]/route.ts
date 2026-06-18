import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { jobUpdateSchema } from '@/lib/validations/jobs'
import { updateCanonicalJob } from '@/modules/ats/domain/job-pipelines'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:view')
  if (denied) return denied

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

/** PATCH — strict: only allowed when status='draft'. */
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
  // any status. The strict draft-only gate only protects the structural edit-form
  // fields (title/description/department/team/confidentiality).
  const { status, custom_fields, ...structural } = body
  const editsStructuralFields = Object.keys(structural).length > 0
  if (editsStructuralFields && row.status !== 'draft') {
    return NextResponse.json({ error: `Cannot edit a job with status '${row.status}'.` }, { status: 409 })
  }

  // custom_fields must MERGE into the existing JSONB, so route the write through
  // the domain facade (read-then-write merge) rather than overwriting the column.
  // The board writers only send status + custom_fields (never the structural
  // edit-form fields), so any structural fields are written by the regular path.
  if (custom_fields !== undefined) {
    if (Object.keys(structural).length > 0) {
      const { error } = await supabase
        .from('jobs').update(structural).eq('id', params.id).eq('org_id', orgId)
      if (error) return handleSupabaseError(error)
    }
    try {
      await updateCanonicalJob(supabase, orgId, params.id, { status, custom_fields })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
    const { data, error } = await supabase
      .from('jobs').select().eq('id', params.id).eq('org_id', orgId).single()
    if (error) return handleSupabaseError(error)
    return NextResponse.json({ data })
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(body)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

/** DELETE — soft-archive (status='archived'). */
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'archived' })
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
