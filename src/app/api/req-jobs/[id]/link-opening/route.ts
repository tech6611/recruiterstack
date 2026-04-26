import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { linkOpeningSchema } from '@/lib/validations/jobs'

/**
 * POST /api/req-jobs/:id/link-opening — link an opening to this job.
 *
 * Both the job and the opening must belong to the caller's org. M2M dupes
 * are blocked by the composite PK on job_openings; we surface 409 cleanly.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const body = await parseBody(req, linkOpeningSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()

  // Verify ownership before linking.
  const [{ data: job }, { data: opening }] = await Promise.all([
    supabase.from('jobs').select('id').eq('id', params.id).eq('org_id', orgId).maybeSingle(),
    supabase.from('openings').select('id').eq('id', body.opening_id).eq('org_id', orgId).maybeSingle(),
  ])
  if (!job)     return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (!opening) return NextResponse.json({ error: 'Opening not found' }, { status: 404 })

  const { error } = await supabase
    .from('job_openings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ job_id: params.id, opening_id: body.opening_id, linked_by: userId } as any)

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already linked.' }, { status: 409 })
    }
    return handleSupabaseError(error)
  }
  return NextResponse.json({ ok: true })
}
