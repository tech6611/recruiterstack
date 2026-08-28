// Interview-plan templates — pure snapshot/remap logic (no I/O). A template
// captures a job's CUSTOM stages (the Active + Offer zones — the interview flow a
// recruiter configures), with their funnel-step mapping and playbook text. The
// fixed framework stages (Lead ladder, Application Review, Hired/Archived) are NOT
// templated — every job already has them.
//
// playbook.next_stage_index is stored as an ordinal into the template's own stages
// array, not a stage id, so applying to a different job can remap it to that job's
// freshly-created stage ids.

import type { ZonedStage } from '@/lib/types/pipeline-automations'
import type { StageZone } from '@/lib/pipeline/zones'

export type TemplateZone = Extract<StageZone, 'active' | 'offer'>
export const TEMPLATE_ZONES: readonly TemplateZone[] = ['active', 'offer']

export interface PlanTemplateStagePlaybook {
  entry_intent: string | null
  advance_criteria: string | null
  reject_to: 'archive' | 'hold' | 'review'
  next_stage_index: number | null
}

export interface PlanTemplateStage {
  name: string
  zone: TemplateZone
  order_index: number
  color: string
  is_promotion_gate: boolean
  funnel_step: string | null
  playbook: PlanTemplateStagePlaybook | null
}

export interface PlanTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  stages: PlanTemplateStage[]
  source_job_id: string | null
  created_by: string | null
  created_at: string
}

/** Is this a stage a template captures? (only the custom Active/Offer flow.) */
export function isTemplatableStage(zone: string): zone is TemplateZone {
  return zone === 'active' || zone === 'offer'
}

/** Snapshot a job's zoned stages into a template's stage array — custom stages
 *  only, in order, with next_stage_id turned into an ordinal within that array. */
export function serializePlanStages(stages: ZonedStage[]): PlanTemplateStage[] {
  const custom = stages
    .filter(s => isTemplatableStage(s.zone))
    .sort((a, b) => a.order_index - b.order_index)

  const indexById = new Map(custom.map((s, i) => [s.id, i]))

  return custom.map((s, i) => ({
    name: s.name,
    zone: s.zone as TemplateZone,
    order_index: i, // renormalise to 0..n within the template
    color: (s as { color?: string }).color ?? 'slate',
    is_promotion_gate: s.is_promotion_gate,
    funnel_step: s.funnel_step ?? null,
    playbook: s.playbook
      ? {
          entry_intent: s.playbook.entry_intent ?? null,
          advance_criteria: s.playbook.advance_criteria ?? null,
          reject_to: s.playbook.reject_to,
          next_stage_index: s.playbook.next_stage_id != null
            ? (indexById.get(s.playbook.next_stage_id) ?? null)
            : null,
        }
      : null,
  }))
}

/** Given the template's stages (in order) and the ids of the stages just created
 *  from them (same order), resolve each stage's next_stage_index to a real id. */
export function resolveNextStageId(
  templateStages: PlanTemplateStage[],
  createdIdsInOrder: string[],
  stageIndex: number,
): string | null {
  const nsi = templateStages[stageIndex]?.playbook?.next_stage_index
  if (nsi == null) return null
  return createdIdsInOrder[nsi] ?? null
}
