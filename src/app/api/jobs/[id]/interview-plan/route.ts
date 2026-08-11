import { NextResponse } from 'next/server'
import { withCapability, parseBody } from '@/lib/api/helpers'
import { interviewPlanPutSchema } from '@/lib/validations/interview-plans'

// `interview_plans` / `interview_plan_rounds` and the pending columns are added by
// migrations 099/101 and aren't in the generated Supabase types yet; use a
// loosely-typed handle for them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// Job statuses where the plan is "live" and changes need HM approval.
const ACTIVE_STATUSES = ['open', 'paused']

// Map a validated round input to an interview_plan_rounds row.
function toRoundRow(orgId: string, planId: string, r: Record<string, unknown>, i: number) {
  return {
    org_id: orgId, plan_id: planId, order_index: i,
    name: r.name, interview_type: r.interview_type, duration_minutes: r.duration_minutes,
    interviewer_role: r.interviewer_role ?? null,
    interviewer_user_id: r.interviewer_user_id ?? null,
    interviewer_name: r.interviewer_name ?? null,
    stage_id: r.stage_id ?? null, scorecard_id: r.scorecard_id ?? null,
  }
}

// GET /api/jobs/:id/interview-plan — plan + rounds, plus any pending change and
// whether the current viewer can decide it.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }, _scope, userId) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id

  const { data: job } = await sb.from('jobs').select('status').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  const { data: plan } = await sb.from('interview_plans').select('*').eq('org_id', orgId).eq('job_id', jobId).maybeSingle()

  let rounds: unknown[] = []
  if (plan) {
    const { data } = await sb.from('interview_plan_rounds').select('*').eq('plan_id', plan.id).order('order_index', { ascending: true })
    rounds = data ?? []
  }

  const meta = plan?.pending_meta && plan.pending_meta.status === 'pending' ? plan.pending_meta : null
  const pending = meta ? { rounds: plan.pending_rounds ?? [], meta } : null
  const approvalRequired = ACTIVE_STATUSES.includes(job?.status) && rounds.length > 0
  // Strict: only the designated approver decides (the assigned HM, or the
  // Owner/admin only in the no-HM fallback where they ARE the approver).
  const canDecide = !!pending && userId === meta.approver_user_id

  return NextResponse.json({ data: { plan: plan ?? null, rounds, pending, approvalRequired, canDecide } })
})

// PUT /api/jobs/:id/interview-plan — save the rounds. On an Active job that
// already has a plan, this parks the change for HM approval instead of applying.
export const PUT = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id
  const body = await parseBody(req, interviewPlanPutSchema)
  if (body instanceof NextResponse) return body

  const { data: job } = await sb.from('jobs').select('status, hiring_manager_user_id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Ensure a plan row exists (one per job); keep jobs.interview_plan_id linked.
  // select('*') so a pre-migration-101 DB (no pending_* columns) still works.
  let { data: plan } = await sb.from('interview_plans').select('*').eq('org_id', orgId).eq('job_id', jobId).maybeSingle()
  if (!plan) {
    const ins = await sb.from('interview_plans').insert({ org_id: orgId, job_id: jobId }).select('id').single()
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
    plan = ins.data
    await sb.from('jobs').update({ interview_plan_id: plan.id }).eq('id', jobId).eq('org_id', orgId)
  }
  const planId = plan.id

  // Block a second submission while one is already pending.
  if (plan.pending_meta?.status === 'pending') {
    return NextResponse.json({ error: 'A change is already awaiting approval.' }, { status: 409 })
  }

  const existing = (await sb.from('interview_plan_rounds').select('id').eq('plan_id', planId)).data ?? []
  const approvalRequired = ACTIVE_STATUSES.includes(job.status) && existing.length > 0

  if (approvalRequired) {
    // Route to the job's hiring manager; fall back to an Owner/admin so it never sticks.
    let approverUserId: string | null = job.hiring_manager_user_id ?? null
    let approverSource = 'hiring_manager'
    if (!approverUserId) {
      const { data: owner } = await sb.from('org_members')
        .select('user_id').eq('org_id', orgId).eq('role', 'admin').eq('is_active', true).limit(1).maybeSingle()
      approverUserId = owner?.user_id ?? null
      approverSource = 'owner_fallback'
    }
    const meta = {
      status: 'pending', requested_by: userId, requested_at: new Date().toISOString(),
      approver_user_id: approverUserId, approver_source: approverSource,
    }
    await sb.from('interview_plans').update({ pending_rounds: body.rounds, pending_meta: meta }).eq('id', planId)
    return NextResponse.json({ data: { status: 'pending_approval', approver_source: approverSource } })
  }

  // Direct save (draft job, or the first plan on any job): replace-all.
  await sb.from('interview_plan_rounds').delete().eq('plan_id', planId)
  if (body.rounds.length) {
    const ins = await sb.from('interview_plan_rounds').insert(body.rounds.map((r, i) => toRoundRow(orgId, planId, r as Record<string, unknown>, i)))
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
  }
  await sb.from('interview_plans').update({ pending_rounds: null, pending_meta: null, updated_at: new Date().toISOString() }).eq('id', planId)

  const { data: rounds } = await sb.from('interview_plan_rounds').select('*').eq('plan_id', planId).order('order_index', { ascending: true })
  return NextResponse.json({ data: { status: 'saved', plan, rounds: rounds ?? [] } })
})
