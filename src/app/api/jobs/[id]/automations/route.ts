import { NextResponse } from 'next/server'
import { withCapability, withScope } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { pipelineAutomationInputSchema } from '@/lib/validations/pipeline-automations'
import {
  listJobAutomations, createAutomation, updateAutomation, deleteAutomation, getZonedStages,
} from '@/modules/ats/domain/pipeline-automations'

// Stage automation rules (Phase A: define IF/THEN rules per stage). Backed by the
// pipeline_automations table (migration 123 — already on prod), so no migration.
// Rules are defined here; the evaluator that fires them lands in Phase B.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// GET /api/jobs/:id/automations — all rules for the job (client groups by stage).
export const GET = withScope(async (_req, orgId, supabase, { params }, scope) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id
  const { data: job } = await sb.from('jobs').select('status, hiring_manager_user_id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  const denied = assertCanViewJob(scope, job)
  if (denied) return denied
  const rules = await listJobAutomations(supabase, orgId, jobId)
  return NextResponse.json({ data: { rules } })
})

// POST /api/jobs/:id/automations — create | update | delete a rule.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const sb = supabase as unknown as Loose
  const jobId = params.id

  let raw: Record<string, unknown>
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = raw.action as string

  const { data: job } = await sb.from('jobs').select('id').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (action === 'delete') {
    if (!raw.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await deleteAutomation(supabase, orgId, String(raw.id))
    return NextResponse.json({ data: { ok: true } })
  }

  if (action === 'create' || action === 'update') {
    // Reuse the input schema; parseBody reads req again, so validate the parsed rule directly.
    const parsed = pipelineAutomationInputSchema.safeParse(raw.rule)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rule' }, { status: 400 })
    }
    const rule = parsed.data

    // Guard: the rule's stage must belong to this job. Also, move_stage targets.
    const stages = await getZonedStages(supabase, orgId, jobId)
    const stageIds = new Set(stages.map(s => s.id))
    if (!stageIds.has(rule.stage_id)) return NextResponse.json({ error: 'Unknown stage' }, { status: 400 })
    const target = rule.config?.target_stage_id
    if (rule.action_type === 'move_stage' && (!target || !stageIds.has(String(target)))) {
      return NextResponse.json({ error: 'Choose a valid stage to move to' }, { status: 400 })
    }

    if (action === 'create') {
      const created = await createAutomation(supabase, orgId, jobId, rule, userId)
      return NextResponse.json({ data: { rule: created } }, { status: 201 })
    }
    if (!raw.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const updated = await updateAutomation(supabase, orgId, String(raw.id), {
      trigger: rule.trigger, action_type: rule.action_type, uses_agent: rule.uses_agent,
      mode: rule.mode, config: rule.config, guardrails: rule.guardrails, enabled: rule.enabled,
      stage_id: rule.stage_id,
    })
    return NextResponse.json({ data: { rule: updated } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
})
