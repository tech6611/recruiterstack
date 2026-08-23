import { NextResponse } from 'next/server'
import { withCapability, withScope, parseBody } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { pipelinePlanPutSchema } from '@/lib/validations/pipeline-automations'
import {
  getZonedStages, upsertStagePlaybook, updateStageFunnelStep,
  createStage, renameStage, deleteStage, reorderStages,
} from '@/modules/ats/domain/pipeline-automations'
import type { StageZone } from '@/lib/pipeline/zones'

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
    // funnel_step lives on the stage itself (Ashby's Stage Group mapping).
    if (pb.funnel_step !== undefined) {
      await updateStageFunnelStep(supabase, orgId, pb.stage_id, pb.funnel_step ?? null)
    }
  }

  const refreshed = await getZonedStages(supabase, orgId, jobId)
  return NextResponse.json({ data: { status: 'saved', stages: refreshed } })
})

// POST /api/jobs/:id/pipeline-plan — structural stage edits (Ashby-style inline
// editing): add / rename / delete / reorder stages on the canonical job. Fixed
// stages (lead ladder + terminal) are protected by the facade.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { data: job } = await sb.from('jobs').select('id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const action = body.action as string
  const ZONES = ['lead', 'active', 'offer', 'completed']

  try {
    if (action === 'create_stage') {
      const name = String(body.name ?? '').trim()
      const zone = body.zone as StageZone
      if (!name) return NextResponse.json({ error: 'Stage name required' }, { status: 400 })
      if (!ZONES.includes(zone)) return NextResponse.json({ error: 'Invalid zone' }, { status: 400 })
      // New stages only in the customizable zones (lead ladder is fixed).
      if (zone === 'lead') return NextResponse.json({ error: 'The lead zone is fixed' }, { status: 400 })
      const stage = await createStage(supabase, orgId, jobId, { name, zone })
      return NextResponse.json({ data: { stage } }, { status: 201 })
    }
    if (action === 'rename_stage') {
      const name = String(body.name ?? '').trim()
      if (!body.stage_id || !name) return NextResponse.json({ error: 'stage_id and name required' }, { status: 400 })
      await renameStage(supabase, orgId, jobId, String(body.stage_id), name)
      return NextResponse.json({ data: { ok: true } })
    }
    if (action === 'delete_stage') {
      if (!body.stage_id) return NextResponse.json({ error: 'stage_id required' }, { status: 400 })
      await deleteStage(supabase, orgId, jobId, String(body.stage_id))
      return NextResponse.json({ data: { ok: true } })
    }
    if (action === 'reorder_stages') {
      const order = (body.order as { id: string; order_index: number }[]) ?? []
      if (!order.length) return NextResponse.json({ error: 'order required' }, { status: 400 })
      await reorderStages(supabase, orgId, jobId, order)
      return NextResponse.json({ data: { ok: true } })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'STAGE_LOCKED') return NextResponse.json({ error: 'This stage is fixed and can’t be renamed or removed.' }, { status: 400 })
    if (msg === 'STAGE_NOT_FOUND') return NextResponse.json({ error: 'Stage not found.' }, { status: 404 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
