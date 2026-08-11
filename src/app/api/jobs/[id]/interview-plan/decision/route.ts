import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// POST /api/jobs/:id/interview-plan/decision  { decision: 'approve'|'reject', reason?: string }
// The hiring manager (or an Owner) decides on a pending interview-plan change.
// Approve applies the parked rounds to the live plan; reject discards them.
export const POST = withCapability('approvals:approve', async (req, orgId, supabase, { params }, _scope, userId) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id
  const body = await req.json().catch(() => null)
  const decision: string | undefined = body?.decision
  const reason: string | null = body?.reason ?? null
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 })
  }

  const { data: plan } = await sb
    .from('interview_plans').select('*').eq('org_id', orgId).eq('job_id', jobId).maybeSingle()
  const meta = plan?.pending_meta
  if (!plan || !meta || meta.status !== 'pending') {
    return NextResponse.json({ error: 'No change is awaiting approval.' }, { status: 409 })
  }

  // Strict: only the designated approver (the assigned HM, or the Owner/admin in
  // the no-HM fallback) may decide — an Owner can't override the job's HM.
  if (userId !== meta.approver_user_id) {
    return NextResponse.json({ error: 'Only the assigned hiring manager can approve this change.' }, { status: 403 })
  }

  if (decision === 'approve') {
    // Apply the parked rounds to the live plan (replace-all).
    await sb.from('interview_plan_rounds').delete().eq('plan_id', plan.id)
    const rounds = (plan.pending_rounds ?? []) as Record<string, unknown>[]
    if (rounds.length) {
      const rows = rounds.map((r, i) => ({
        org_id: orgId, plan_id: plan.id, order_index: i,
        name: r.name, interview_type: r.interview_type, duration_minutes: r.duration_minutes,
        interviewer_role: r.interviewer_role ?? null,
        interviewer_user_id: r.interviewer_user_id ?? null,
        interviewer_name: r.interviewer_name ?? null,
        stage_id: r.stage_id ?? null, scorecard_id: r.scorecard_id ?? null,
      }))
      const ins = await sb.from('interview_plan_rounds').insert(rows)
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
    }
  }

  // Clear the parked change; keep a decided record (status no longer 'pending').
  await sb.from('interview_plans').update({
    pending_rounds: null,
    pending_meta: { ...meta, status: decision === 'approve' ? 'approved' : 'rejected', decided_by: userId, decided_at: new Date().toISOString(), reason },
    updated_at: new Date().toISOString(),
  }).eq('id', plan.id)

  return NextResponse.json({ data: { decision } })
})
