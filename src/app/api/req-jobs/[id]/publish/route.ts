import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

/**
 * POST /api/req-jobs/:id/publish — flip status from 'approved' to 'open'.
 *
 * Guards (per the prompt's spec):
 *   - Job must be 'approved'
 *   - At least one linked Opening must be 'approved'
 *
 * Postings can only go live after the Job is open — that gate lives in the
 * postings publish endpoint.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const supabase = createAdminClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const j = job as { id: string; status: string }

  if (j.status === 'open')      return NextResponse.json({ ok: true, status: 'open' })
  if (j.status !== 'approved') {
    return NextResponse.json(
      { error: `Job must be 'approved' before publishing. Current status: '${j.status}'.` },
      { status: 409 },
    )
  }

  // Need at least one approved linked opening.
  const { data: links } = await supabase
    .from('job_openings')
    .select('opening_id')
    .eq('job_id', params.id)
  const openingIds = (links ?? []).map(r => (r as { opening_id: string }).opening_id)
  if (openingIds.length === 0) {
    return NextResponse.json(
      { error: 'Need at least one approved Opening linked to this Job before publishing.' },
      { status: 409 },
    )
  }
  const { data: openings } = await supabase
    .from('openings')
    .select('status')
    .in('id', openingIds)
  const anyApproved = (openings ?? []).some(o =>
    ['approved', 'open', 'filled'].includes((o as { status: string }).status),
  )
  if (!anyApproved) {
    return NextResponse.json(
      { error: 'Need at least one approved Opening linked to this Job before publishing.' },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'open' })
    .eq('id', params.id)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: 'open' })
}
