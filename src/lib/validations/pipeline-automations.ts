import { z } from 'zod'

// Validation for the Slice 1a write paths: the per-stage playbook and the
// pipeline-automation rules. Enum values must stay in lockstep with migration
// 121's CHECK constraints and the types in @/lib/types/pipeline-automations.

export const rejectDestinationEnum = z.enum(['archive', 'hold', 'review'])

export const automationTriggerEnum = z.enum(['stage_entry', 'feedback_complete', 'sla_elapsed'])

export const automationActionTypeEnum = z.enum([
  'enrol_outreach', 'promote_lead', 'screen', 'send_email', 'send_assessment',
  'schedule_interview', 'request_availability', 'handoff_to_hm', 'move_stage',
  'create_offer', 'archive', 'request_approval',
])

export const automationModeEnum = z.enum(['auto', 'suggest', 'approval_required'])

/** Save one stage's plain-English playbook. */
export const stagePlaybookInputSchema = z.object({
  entry_intent: z.string().max(2000).nullish(),
  advance_criteria: z.string().max(2000).nullish(),
  next_stage_id: z.string().uuid().nullish(),
  reject_to: rejectDestinationEnum.default('archive'),
})

/** Safety knobs on an automation. */
export const automationGuardrailsSchema = z.object({
  undo_window_seconds: z.number().int().min(0).max(86_400).optional(),
  confidence_floor: z.number().min(0).max(1).optional(),
  requires_feedback: z.boolean().optional(),
  daily_cap: z.number().int().min(0).max(10_000).optional(),
})

/** Create / update a trigger→action rule on a stage. */
export const pipelineAutomationInputSchema = z.object({
  stage_id: z.string().uuid(),
  trigger: automationTriggerEnum.default('stage_entry'),
  action_type: automationActionTypeEnum,
  uses_agent: z.boolean().default(false),
  mode: automationModeEnum.default('auto'),
  config: z.record(z.string(), z.unknown()).default({}),
  guardrails: automationGuardrailsSchema.default({}),
  enabled: z.boolean().default(true),
})

export type StagePlaybookInputParsed = z.infer<typeof stagePlaybookInputSchema>
export type PipelineAutomationInputParsed = z.infer<typeof pipelineAutomationInputSchema>
