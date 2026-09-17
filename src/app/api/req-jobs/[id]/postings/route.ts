import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { postingCreateSchema, withoutPosting143Keys } from '@/lib/validations/postings'
import { isUndefinedColumn } from '@/lib/postings/format'

// GET — list postings for a given job (any member who can see the job).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:view')
  if (denied) return denied

  const { data: job } = await supabase
    .from('jobs').select('id').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('job_postings')
    .select('*')
    .eq('job_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data: data ?? [] })
}

// POST — create a new posting under this job.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const body = await parseBody(req, postingCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const { data: job } = await supabase
    .from('jobs').select('id').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const row = {
    job_id:         params.id,
    title:          body.title,
    description:    body.description ?? null,
    location_text:  body.location_text ?? null,
    channel:        body.channel,
    channel_config: body.channel_config ?? {},
    created_by:     userId,
    // migration 144
    visibility:         body.visibility ?? 'listed',
    location_id:        body.location_id ?? null,
    show_compensation:  body.show_compensation ?? true,
    comp_min:           body.comp_min ?? null,
    comp_max:           body.comp_max ?? null,
    comp_currency:      body.comp_currency ?? null,
    social_description: body.social_description ?? null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result = await (supabase as any).from('job_postings').insert(row).select().single()
  // Live DB predates migration 144 → retry with only the original columns.
  if (result.error && isUndefinedColumn(result.error)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (supabase as any).from('job_postings').insert(withoutPosting143Keys(row)).select().single()
  }
  const { data, error } = result

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
