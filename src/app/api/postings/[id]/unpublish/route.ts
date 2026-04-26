import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

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
    .select('org_id')
    .eq('id', p.job_id)
    .maybeSingle()
  if (!job || (job as { org_id: string }).org_id !== orgId) {
    return NextResponse.json({ error: 'Posting not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('job_postings')
    .update({ is_live: false, unpublished_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
