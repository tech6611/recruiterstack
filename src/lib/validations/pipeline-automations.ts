import { z } from 'zod'
import { FUNNEL_STEP_IDS } from '@/lib/pipeline/funnel-steps'
import { isValidCondition } from '@/lib/pipeline/rule-fields'

// Validation for the Slice 1a write paths: the per-stage playbook and the
// pipeline-automation rules. Enum values must stay in lockstep with migration
// 121's CHECK constraints and the types in @/lib/types/pipeline-automations.

export const rejectDestinationEnum = z.enum(['archive', 'hold', 'review'])

export const automationTriggerEnum = z.enum(['stage_entry', 'feedback_complete', 'sla_elapsed'])

export const automationActionTypeEnum = z.enum([
  'enrol_outreach', 'promote_lead', 'ai_call', 'screen', 'send_email', 'send_assessment',
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

export const ruleFieldEnum = z.enum([
  'days_in_stage', 'ai_score', 'fit_bucket', 'review_status', 'has_feedback', 'feedback_result', 'source', 'missing_must_have', 'enrolled', 'replied', 'has_ai_call', 'ai_call_score',
])
export const ruleOperatorEnum = z.enum([
  'gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'is', 'is_not', 'is_true', 'is_false',
])

/** One IF clause of a rule. Validated against the field/operator/value rules in
 *  rule-fields.ts so a half-built or nonsensical clause can't be saved. */
export const ruleConditionSchema = z.object({
  field: ruleFieldEnum,
  operator: ruleOperatorEnum,
  value: z.union([z.string(), z.number()]).optional(),
}).refine(c => isValidCondition(c.field, c.operator, c.value), { message: 'Invalid condition' })

/** The structured config for a conditional stage rule. */
export const automationConfigSchema = z.object({
  conditions: z.array(ruleConditionSchema).max(8).default([]),
  match: z.enum(['all', 'any']).default('all'),
  target_stage_id: z.string().uuid().nullish(),
  sequence_id: z.string().uuid().nullish(),
  email_template_id: z.string().nullish(),
}).passthrough()

/** Create / update a trigger→action rule on a stage. */
export const pipelineAutomationInputSchema = z.object({
  stage_id: z.string().uuid(),
  trigger: automationTriggerEnum.default('stage_entry'),
  action_type: automationActionTypeEnum,
  uses_agent: z.boolean().default(false),
  mode: automationModeEnum.default('auto'),
  config: automationConfigSchema.default({ conditions: [], match: 'all' }),
  guardrails: automationGuardrailsSchema.default({}),
  enabled: z.boolean().default(true),
})

/** Full-plan save: the client sends a playbook entry per stage it edited, plus
 *  the canonical funnel step the stage maps to (Ashby's "Stage Group"). */
export const pipelinePlanPutSchema = z.object({
  playbooks: z
    .array(
      stagePlaybookInputSchema.extend({
        stage_id: z.string().uuid(),
        funnel_step: z
          .string()
          .refine(v => FUNNEL_STEP_IDS.includes(v), 'Unknown funnel step')
          .nullish(),
        interview_panel: z
          .array(z.object({ name: z.string().max(160), email: z.string().email() }))
          .max(10)
          .nullish(),
      }),
    )
    .max(50),
})

export type PipelinePlanPutParsed = z.infer<typeof pipelinePlanPutSchema>
export type StagePlaybookInputParsed = z.infer<typeof stagePlaybookInputSchema>
export type PipelineAutomationInputParsed = z.infer<typeof pipelineAutomationInputSchema>
