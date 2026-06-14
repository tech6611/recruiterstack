import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { linkOpeningSchema } from '@/lib/validations/jobs'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const body = await parseBody(req, linkOpeningSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  const { data: job } = await supabase.from('jobs').select('id').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const { error } = await supabase
    .from('job_openings')
    .delete()
    .eq('job_id', params.id)
    .eq('opening_id', body.opening_id)
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ ok: true })
}
