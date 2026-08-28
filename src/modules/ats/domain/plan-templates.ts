import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { StageZone } from '@/lib/pipeline/zones'
import type { PlanTemplate, PlanTemplateStage } from '@/lib/pipeline/plan-templates'
import { serializePlanStages, resolveNextStageId, isTemplatableStage } from '@/lib/pipeline/plan-templates'
import {
  getZonedStages, createStage, deleteStage, reorderStages,
  updateStageFunnelStep, upsertStagePlaybook, isLockedStage,
} from '@/modules/ats/domain/pipeline-automations'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// plan_templates (migration 137) isn't in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

// Interview-plan templates — save a job's custom pipeline (Active + Offer stages,
// with funnel steps + playbooks) as a reusable org template, and apply it to
// another job. Mirrors role-templates (ICP) but for the pipeline shape.

export async function listPlanTemplates(supabase: Supabase, orgId: string): Promise<PlanTemplate[]> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('plan_templates').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PlanTemplate[]
}

export async function getPlanTemplate(supabase: Supabase, orgId: string, id: string): Promise<PlanTemplate | null> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('plan_templates').select('*').eq('org_id', orgId).eq('id', id).maybeSingle()
  if (error) throw error
  return (data ?? null) as PlanTemplate | null
}

export async function deletePlanTemplate(supabase: Supabase, orgId: string, id: string): Promise<void> {
  const { error } = await (supabase as unknown as LooseSb)
    .from('plan_templates').delete().eq('org_id', orgId).eq('id', id)
  if (error) throw error
}

/** Save a job's current pipeline plan (its Active + Offer stages) as a template. */
export async function createPlanTemplateFromJob(
  supabase: Supabase,
  orgId: string,
  params: { name: string; description?: string | null; jobId: string; createdBy?: string | null },
): Promise<PlanTemplate> {
  const { name, description = null, jobId, createdBy = null } = params
  const zoned = await getZonedStages(supabase, orgId, jobId)

  // getZonedStages omits color; fetch it so templates preserve stage colours.
  const sb = supabase as unknown as LooseSb
  const { data: colorRows } = await sb
    .from('pipeline_stages').select('id, color').eq('org_id', orgId).eq('job_id', jobId)
  const colorById = new Map<string, string>((colorRows ?? []).map((r: { id: string; color: string }) => [r.id, r.color]))
  const withColor = zoned.map(s => ({ ...s, color: colorById.get(s.id) ?? 'slate' }))

  const stages: PlanTemplateStage[] = serializePlanStages(withColor)
  if (stages.length === 0) throw new Error('TEMPLATE_EMPTY')

  const { data, error } = await sb
    .from('plan_templates')
    .insert({ org_id: orgId, name, description, stages, source_job_id: jobId, created_by: createdBy })
    .select('*').single()
  if (error) throw error
  return data as PlanTemplate
}

/**
 * Apply a template to a job: replace the job's custom (Active + Offer) stages with
 * the template's, preserving the fixed framework stages (Lead, Application Review,
 * Hired/Archived). Candidates in a replaced stage are moved back to "Applied" so no
 * one is left without a stage, then the old custom stages are removed.
 */
export async function applyPlanTemplateToJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  template: Pick<PlanTemplate, 'stages'>,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const before = await getZonedStages(supabase, orgId, jobId)

  const appliedStage = before.find(s => s.zone === 'application_review')
    ?? before.slice().sort((a, b) => a.order_index - b.order_index)[0]
  const oldCustom = before.filter(s => isTemplatableStage(s.zone) && !isLockedStage(s.zone, s.name))

  const tStages = [...template.stages].sort((a, b) => a.order_index - b.order_index)
  if (tStages.length === 0) return

  // 1. Create the template's stages (sequentially → ids come back in template order).
  const createdIds: string[] = []
  for (const t of tStages) {
    const created = await createStage(supabase, orgId, jobId, { name: t.name, zone: t.zone as StageZone, color: t.color })
    createdIds.push(created.id)
  }

  // 2. Funnel step + playbook onto the new stages (remap next_stage → new id).
  for (let i = 0; i < tStages.length; i++) {
    const t = tStages[i]
    if (t.funnel_step) await updateStageFunnelStep(supabase, orgId, createdIds[i], t.funnel_step)
    if (t.playbook) {
      await upsertStagePlaybook(supabase, orgId, createdIds[i], {
        entry_intent: t.playbook.entry_intent,
        advance_criteria: t.playbook.advance_criteria,
        reject_to: t.playbook.reject_to,
        next_stage_id: resolveNextStageId(tStages, createdIds, i),
      })
    }
  }

  // 3. Move candidates out of the old custom stages → Applied, then delete them.
  if (oldCustom.length && appliedStage) {
    const oldIds = oldCustom.map(s => s.id)
    await sb.from('applications').update({ stage_id: appliedStage.id })
      .eq('org_id', orgId).eq('job_id', jobId).in('stage_id', oldIds)
    for (const s of oldCustom) {
      try { await deleteStage(supabase, orgId, jobId, s.id) }
      catch (err) { logger.warn('applyPlanTemplate: could not delete old stage', { stageId: s.id, err }) }
    }
  }

  // 4. Renumber every stage so the new custom flow sits in funnel order between
  //    Application Review and the terminal stages.
  const after = await getZonedStages(supabase, orgId, jobId)
  const zoneRank: Record<string, number> = { lead: 0, application_review: 1, active: 2, offer: 3, completed: 4 }
  const createdOrder = new Map(createdIds.map((id, i) => [id, i]))
  const ordered = after.slice().sort((a, b) => {
    const zr = (zoneRank[a.zone] ?? 9) - (zoneRank[b.zone] ?? 9)
    if (zr !== 0) return zr
    const ao = createdOrder.get(a.id), bo = createdOrder.get(b.id)
    if (ao != null && bo != null) return ao - bo
    return a.order_index - b.order_index
  })
  await reorderStages(supabase, orgId, jobId, ordered.map((s, i) => ({ id: s.id, order_index: i })))
}
