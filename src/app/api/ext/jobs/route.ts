import { NextResponse } from 'next/server'
import { withApiKey } from '@/lib/api/api-keys'

// Tables not yet in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

// GET /api/ext/jobs — the org's jobs that have an APPROVED ICP, so the extension
// can offer a "score this profile against…" picker. Only approved-ICP jobs are
// scoreable by the Fit Engine, so those are the only ones we surface. API-key auth.
export const GET = withApiKey(async (_req, orgId, supabase) => {
  const sb = supabase as unknown as LooseSb

  const { data: icps, error } = await sb
    .from('icps')
    .select('job_id')
    .eq('org_id', orgId)
    .eq('status', 'approved')
  if (error) {
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 })
  }

  const jobIds = Array.from(
    new Set((icps ?? []).map((r: { job_id: string | null }) => r.job_id).filter(Boolean)),
  )
  if (!jobIds.length) return NextResponse.json({ data: [] })

  const { data: jobs, error: jobsErr } = await sb
    .from('jobs')
    .select('id, title')
    .eq('org_id', orgId)
    .in('id', jobIds)
    .order('title')
  if (jobsErr) {
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 })
  }

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: (jobs ?? []).map((j: any) => ({ id: j.id, title: j.title })),
  })
})
