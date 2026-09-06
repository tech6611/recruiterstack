// Interview-plan templates — pure snapshot/remap logic (no I/O). A template
// captures a job's CUSTOM stages (the Active + Offer zones — the interview flow a
// recruiter configures), with their funnel-step mapping and playbook text. The
// fixed framework stages (Lead ladder, Application Review, Hired/Archived) are NOT
// templated — every job already has them.
//
// playbook.next_stage_index is stored as an ordinal into the template's own stages
// array, not a stage id, so applying to a different job can remap it to that job's
// freshly-created stage ids.

import type {
  ZonedStage, PipelineAutomation, AutomationTrigger, AutomationActionType,
  AutomationMode, AutomationConfig, AutomationGuardrails,
} from '@/lib/types/pipeline-automations'
import type { StageZone } from '@/lib/pipeline/zones'

export type TemplateZone = Extract<StageZone, 'active' | 'offer'>
export const TEMPLATE_ZONES: readonly TemplateZone[] = ['active', 'offer']

export interface PlanTemplateStagePlaybook {
  entry_intent: string | null
  advance_criteria: string | null
  reject_to: 'archive' | 'hold' | 'review'
  next_stage_index: number | null
}

/** A rule captured in a template. Any stage reference (which stage it moves people
 *  to) is stored as an ordinal into the template's stages array, so apply can remap
 *  it to the target job's freshly-created stage ids. */
export interface PlanTemplateRule {
  trigger: AutomationTrigger
  action_type: AutomationActionType
  mode: AutomationMode
  uses_agent: boolean
  enabled: boolean
  guardrails: AutomationGuardrails
  /** Rule config with target_stage_id stripped (it's stored as target_stage_index
   *  and remapped on apply). Typed as the full config for convenience. */
  config: AutomationConfig
  /** move_stage destination, as an ordinal into the template's stages (or null). */
  target_stage_index: number | null
}

export interface PlanTemplateStage {
  name: string
  zone: TemplateZone
  order_index: number
  color: string
  is_promotion_gate: boolean
  funnel_step: string | null
  playbook: PlanTemplateStagePlaybook | null
  rules: PlanTemplateRule[]
}

/** Actions that reference something outside the plan (a specific sequence, or an
 *  interview panel of specific people) and so can't be copied cleanly between jobs.
 *  These are skipped on save and reported, rather than copied broken. */
export const NON_TRANSFERABLE_ACTIONS: readonly AutomationActionType[] = [
  'enrol_outreach', 'schedule_interview', 'request_availability',
]
export function isTransferableRule(actionType: AutomationActionType): boolean {
  return !NON_TRANSFERABLE_ACTIONS.includes(actionType)
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

export interface SerializePlanResult {
  stages: PlanTemplateStage[]
  /** Names of rules skipped because their action can't be copied across jobs. */
  skippedRules: string[]
}

/** Snapshot a job's zoned stages (custom Active/Offer only) into template stages,
 *  including their automation rules. next_stage_id and each move rule's target are
 *  stored as ordinals into the template so apply can remap them. Rules whose action
 *  references something job-specific (a sequence / a people panel) are skipped and
 *  reported, not copied broken. `rulesByStage` maps a stage id → its rules. */
export function serializePlanStages(
  stages: ZonedStage[],
  rulesByStage: Map<string, PipelineAutomation[]> = new Map(),
): SerializePlanResult {
  const custom = stages
    .filter(s => isTemplatableStage(s.zone))
    .sort((a, b) => a.order_index - b.order_index)

  const indexById = new Map(custom.map((s, i) => [s.id, i]))
  const skippedRules: string[] = []

  const outStages = custom.map((s, i) => {
    const rules: PlanTemplateRule[] = []
    for (const r of rulesByStage.get(s.id) ?? []) {
      if (!isTransferableRule(r.action_type)) {
        skippedRules.push(`${s.name}: ${r.action_type.replace(/_/g, ' ')}`)
        continue
      }
      const { target_stage_id, ...restConfig } = r.config ?? {}
      rules.push({
        trigger: r.trigger,
        action_type: r.action_type,
        mode: r.mode,
        uses_agent: r.uses_agent,
        enabled: r.enabled,
        guardrails: r.guardrails ?? {},
        config: restConfig,
        target_stage_index: target_stage_id != null ? (indexById.get(target_stage_id) ?? null) : null,
      })
    }
    return {
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
      rules,
    }
  })
  return { stages: outStages, skippedRules }
}

/** Resolve a template rule's target_stage_index to a created stage id (or null). */
export function resolveRuleTargetStageId(
  createdIdsInOrder: string[],
  targetStageIndex: number | null,
): string | null {
  if (targetStageIndex == null) return null
  return createdIdsInOrder[targetStageIndex] ?? null
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
