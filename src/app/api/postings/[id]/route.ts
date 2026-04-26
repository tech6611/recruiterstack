import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { postingUpdateSchema } from '@/lib/validations/postings'

/** Helper: confirm a posting belongs to a job in the caller's org. */
async function checkPostingOrg(postingId: string, orgId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('job_postings')
    .select('id, job_id, jobs:job_id (org_id, status)')
    .eq('id', postingId)
    .maybeSingle()
  return (data as { id: string; job_id: string; jobs: { org_id: string; status: string } | null } | null)
    ?.jobs?.org_id === orgId ? data : null
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('job_postings').select('*').eq('id', params.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Org gate: do a join lookup
  const owner = await checkPostingOrg(params.id, auth.orgId)
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: row })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const owner = await checkPostingOrg(params.id, auth.orgId)
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await parseBody(req, postingUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('job_postings')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const owner = await checkPostingOrg(params.id, auth.orgId)
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('job_postings')
    .delete()                                 // hard delete — postings are presentation; safe to remove
    .eq('id', params.id)
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ ok: true })
}
