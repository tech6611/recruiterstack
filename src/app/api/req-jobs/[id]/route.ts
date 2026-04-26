import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { jobUpdateSchema } from '@/lib/validations/jobs'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const supabase = createAdminClient()
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
  const { orgId } = auth

  const body = await parseBody(req, jobUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('jobs').select('id, status').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  const row = existing as { id: string; status: string } | null
  if (!row) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (row.status !== 'draft') {
    return NextResponse.json({ error: `Cannot edit a job with status '${row.status}'.` }, { status: 409 })
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
  const { orgId } = auth

  const supabase = createAdminClient()
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
