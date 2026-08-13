import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

// `interview_plans.pending_meta / pending_rounds` (migrations 099/101) aren't in
// the generated Supabase types yet; use a loosely-typed handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// GET /api/me/interview-plan-approvals — interview-plan changes awaiting MY
// decision (I'm the assigned approver). Surfaces them in the Approvals inbox so
// the hiring manager doesn't depend on the bell notification alone.
export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth
  const sb = createAdminClient() as unknown as Loose

  const { data: plans, error } = await sb
    .from('interview_plans')
    .select('job_id, pending_meta, pending_rounds')
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ data: [] })

  const pending = (plans ?? []).filter(
    (p: Loose) => p.pending_meta?.status === 'pending' && p.pending_meta?.approver_user_id === userId,
  )
  if (pending.length === 0) return NextResponse.json({ data: [] })

  // Enrich with job titles + requester names in two bounded round-trips.
  const jobIds = Array.from(new Set(pending.map((p: Loose) => p.job_id)))
  const requesterIds = Array.from(new Set(pending.map((p: Loose) => p.pending_meta?.requested_by).filter(Boolean)))
  const [{ data: jobs }, usersRes] = await Promise.all([
    sb.from('jobs').select('id, title').in('id', jobIds),
    requesterIds.length
      ? sb.from('users').select('id, full_name, email').in('id', requesterIds)
      : Promise.resolve({ data: [] }),
  ])
  const jobTitle = new Map((jobs ?? []).map((j: Loose) => [j.id, j.title]))
  const userName = new Map((usersRes.data ?? []).map((u: Loose) => [u.id, u.full_name || u.email]))

  const data = pending.map((p: Loose) => ({
    job_id:            p.job_id,
    job_title:         jobTitle.get(p.job_id) ?? 'a job',
    requested_by_name: userName.get(p.pending_meta?.requested_by) ?? null,
    requested_at:      p.pending_meta?.requested_at ?? null,
    rounds_count:      Array.isArray(p.pending_rounds) ? p.pending_rounds.length : 0,
  }))
  return NextResponse.json({ data })
}
