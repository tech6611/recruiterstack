import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

/**
 * POST /api/postings/:id/publish — gate: parent job must be 'open'.
 * (i.e. approved and the org clicked Publish on the job.)
 */
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const supabase = createAdminClient()
  const { data: posting } = await supabase
    .from('job_postings')
    .select('id, job_id')
    .eq('id', params.id)
    .maybeSingle()
  const p = posting as { id: string; job_id: string } | null
  if (!p) return NextResponse.json({ error: 'Posting not found' }, { status: 404 })

  const { data: job } = await supabase
    .from('jobs')
    .select('status, org_id')
    .eq('id', p.job_id)
    .maybeSingle()
  const j = job as { status: string; org_id: string } | null
  if (!j || j.org_id !== orgId) return NextResponse.json({ error: 'Posting not found' }, { status: 404 })
  if (j.status !== 'open') {
    return NextResponse.json(
      { error: `Job must be 'open' before its postings can go live. Current status: '${j.status}'.` },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('job_postings')
    .update({ is_live: true, published_at: now, unpublished_at: null })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
