import { NextResponse } from 'next/server'
import { withCapability, withScope, parseBody } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { pipelinePlanPutSchema } from '@/lib/validations/pipeline-automations'
import { getZonedStages, upsertStagePlaybook } from '@/modules/ats/domain/pipeline-automations'

// The pipeline-plan surface (Slice 1b): the job's zoned stages, each with the
// recruiter's plain-English playbook (entry_intent / advance_criteria / reject_to).
// Reads/writes go through the pipeline-automations facade (migration 123).

// jobs columns aren't fully in the generated Supabase types; cast as elsewhere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// GET /api/jobs/:id/pipeline-plan — zoned stages + their playbooks, funnel order.
export const GET = withScope(async (_req, orgId, supabase, { params }, scope) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id

  const { data: job } = await sb
    .from('jobs')
    .select('status, hiring_manager_user_id')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle()
  const denied = assertCanViewJob(scope, job)
  if (denied) return denied

  const stages = await getZonedStages(supabase, orgId, jobId)
  return NextResponse.json({ data: { stages } })
})

// PUT /api/jobs/:id/pipeline-plan — save the per-stage playbooks. Only stages
// that belong to THIS job+org are accepted (others are ignored, not an error).
export const PUT = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id

  const body = await parseBody(req, pipelinePlanPutSchema)
  if (body instanceof NextResponse) return body

  const { data: job } = await sb.from('jobs').select('id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Guard: only persist playbooks for stages that actually belong to this job.
  const stages = await getZonedStages(supabase, orgId, jobId)
  const validStageIds = new Set(stages.map(s => s.id))

  for (const pb of body.playbooks) {
    if (!validStageIds.has(pb.stage_id)) continue
    await upsertStagePlaybook(supabase, orgId, pb.stage_id, {
      entry_intent: pb.entry_intent ?? null,
      advance_criteria: pb.advance_criteria ?? null,
      next_stage_id: pb.next_stage_id ?? null,
      reject_to: pb.reject_to,
    })
  }

  const refreshed = await getZonedStages(supabase, orgId, jobId)
  return NextResponse.json({ data: { status: 'saved', stages: refreshed } })
})
