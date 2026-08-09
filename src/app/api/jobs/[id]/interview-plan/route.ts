import { NextResponse } from 'next/server'
import { withCapability, parseBody } from '@/lib/api/helpers'
import { interviewPlanPutSchema } from '@/lib/validations/interview-plans'

// `interview_plans` / `interview_plan_rounds` are added by migration 099 and are
// not in the generated Supabase types yet; use a loosely-typed handle for them.
// (Once the migration is applied and `npm run gen:types` runs, this can tighten.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// GET /api/jobs/:id/interview-plan — the job's plan + ordered rounds (or null).
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id

  const { data: plan } = await sb
    .from('interview_plans')
    .select('*')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .maybeSingle()

  let rounds: unknown[] = []
  if (plan) {
    const { data } = await sb
      .from('interview_plan_rounds')
      .select('*')
      .eq('plan_id', plan.id)
      .order('order_index', { ascending: true })
    rounds = data ?? []
  }

  return NextResponse.json({ data: { plan: plan ?? null, rounds } })
})

// PUT /api/jobs/:id/interview-plan — replace the job's rounds with the sent list.
export const PUT = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id
  const body = await parseBody(req, interviewPlanPutSchema)
  if (body instanceof NextResponse) return body

  // Job must exist in this org.
  const { data: job } = await sb
    .from('jobs').select('id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Ensure a plan row exists (one per job), and keep jobs.interview_plan_id linked.
  let { data: plan } = await sb
    .from('interview_plans').select('id').eq('org_id', orgId).eq('job_id', jobId).maybeSingle()
  if (!plan) {
    const ins = await sb
      .from('interview_plans').insert({ org_id: orgId, job_id: jobId }).select('id').single()
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
    plan = ins.data
    await sb
      .from('jobs').update({ interview_plan_id: plan.id }).eq('id', jobId).eq('org_id', orgId)
  }
  const planId = plan.id

  // Replace-all semantics: wipe existing rounds, insert the sent list in order.
  await sb.from('interview_plan_rounds').delete().eq('plan_id', planId)
  if (body.rounds.length) {
    const rows = body.rounds.map((r, i) => ({
      org_id: orgId,
      plan_id: planId,
      order_index: i,
      name: r.name,
      interview_type: r.interview_type,
      duration_minutes: r.duration_minutes,
      interviewer_role: r.interviewer_role ?? null,
      interviewer_user_id: r.interviewer_user_id ?? null,
      interviewer_name: r.interviewer_name ?? null,
      stage_id: r.stage_id ?? null,
      scorecard_id: r.scorecard_id ?? null,
    }))
    const ins = await sb.from('interview_plan_rounds').insert(rows)
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })
  }
  await sb.from('interview_plans').update({ updated_at: new Date().toISOString() }).eq('id', planId)

  const { data: rounds } = await sb
    .from('interview_plan_rounds').select('*').eq('plan_id', planId).order('order_index', { ascending: true })

  return NextResponse.json({ data: { plan, rounds: rounds ?? [] } })
})
