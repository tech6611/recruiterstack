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

/** A portable reference to a stage that survives copying between jobs. A CUSTOM
 *  stage (Active/Offer) is referenced by its ordinal in the template's stages array
 *  (its name may be edited); a FRAMEWORK stage (Lead ladder, Applied, Hired,
 *  Archived) is referenced by its stable name, since every job has it. */
export type StageRef = { custom_index: number } | { framework: string }

/** A rule captured in a template. Both the stage it lives on and (for move_stage)
 *  its destination are stored as portable StageRefs, remapped to the target job's
 *  stage ids on apply — so a copied rule runs on the target job's equivalent stages.
 *  Rules are captured on ALL stages, not just the custom ones (the important
 *  first-stage rules typically live on "Applied", a framework stage). */
export interface PlanTemplateRule {
  on_stage: StageRef
  target_stage: StageRef | null
  trigger: AutomationTrigger
  action_type: AutomationActionType
  mode: AutomationMode
  uses_agent: boolean
  enabled: boolean
  guardrails: AutomationGuardrails
  /** Rule config with target_stage_id stripped (stored as target_stage above). */
  config: AutomationConfig
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
  rules: PlanTemplateRule[]
  source_job_id: string | null
  created_by: string | null
  created_at: string
}

/** Is this a stage a template captures? (only the custom Active/Offer flow.) */
export function isTemplatableStage(zone: string): zone is TemplateZone {
  return zone === 'active' || zone === 'offer'
}

/** Snapshot a job's zoned stages into template stages — the CUSTOM Active/Offer
 *  flow only, in order, with funnel-step + playbook (next_stage as an ordinal). */
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

export interface SerializeRulesResult {
  rules: PlanTemplateRule[]
  /** Names of rules skipped because their action can't be copied across jobs. */
  skippedRules: string[]
}

/** Build a portable StageRef for a stage id, given the job's stages. Custom
 *  (Active/Offer) stages → ordinal in the custom list; framework stages → name.
 *  Null when the id isn't a current stage (e.g. a stale/deleted reference). */
function stageRefFor(stageId: string, stages: ZonedStage[]): StageRef | null {
  const s = stages.find(x => x.id === stageId)
  if (!s) return null
  if (isTemplatableStage(s.zone)) {
    const custom = stages.filter(x => isTemplatableStage(x.zone)).sort((a, b) => a.order_index - b.order_index)
    const idx = custom.findIndex(x => x.id === stageId)
    return idx >= 0 ? { custom_index: idx } : null
  }
  return { framework: s.name }
}

/** Snapshot a job's automation rules — from EVERY stage (framework rules like the
 *  first-stage "Applied → Screening if score high" matter most) — into portable
 *  template rules. Each stage reference becomes a StageRef so apply can remap it.
 *  Rules whose action references something job-specific (a sequence / a people
 *  panel) are skipped and reported. `rulesByStage` maps a stage id → its rules. */
export function serializePlanRules(
  stages: ZonedStage[],
  rulesByStage: Map<string, PipelineAutomation[]>,
): SerializeRulesResult {
  const rules: PlanTemplateRule[] = []
  const skippedRules: string[] = []
  const nameById = new Map(stages.map(s => [s.id, s.name]))

  for (const [stageId, stageRules] of Array.from(rulesByStage.entries())) {
    const onStage = stageRefFor(stageId, stages)
    if (!onStage) continue // rule on a stage that no longer exists
    for (const r of stageRules) {
      if (!isTransferableRule(r.action_type)) {
        skippedRules.push(`${nameById.get(stageId) ?? 'stage'}: ${r.action_type.replace(/_/g, ' ')}`)
        continue
      }
      const { target_stage_id, ...restConfig } = r.config ?? {}
      rules.push({
        on_stage: onStage,
        target_stage: target_stage_id != null ? stageRefFor(target_stage_id, stages) : null,
        trigger: r.trigger,
        action_type: r.action_type,
        mode: r.mode,
        uses_agent: r.uses_agent,
        enabled: r.enabled,
        guardrails: r.guardrails ?? {},
        config: restConfig,
      })
    }
  }
  return { rules, skippedRules }
}

/** Resolve a StageRef against a target job: custom → the created stage id at that
 *  ordinal; framework → the target job's stage with that name. Null if unresolvable
 *  (e.g. the target job lacks that framework stage). */
export function resolveStageRef(
  ref: StageRef | null,
  createdCustomIds: string[],
  frameworkIdByName: Map<string, string>,
): string | null {
  if (!ref) return null
  if ('custom_index' in ref) return createdCustomIds[ref.custom_index] ?? null
  return frameworkIdByName.get(ref.framework) ?? null
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
