import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { postingCreateSchema } from '@/lib/validations/postings'

// GET — list postings for a given job (any member who can see the job).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const supabase = createAdminClient()
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
  const { data: job } = await supabase
    .from('jobs').select('id').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('job_postings')
    .insert({
      job_id:         params.id,
      title:          body.title,
      description:    body.description ?? null,
      location_text:  body.location_text ?? null,
      channel:        body.channel,
      channel_config: body.channel_config ?? {},
      created_by:     userId,
    })
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
