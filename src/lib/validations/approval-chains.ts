import { z } from 'zod'

const conditionLeaf: z.ZodTypeAny = z.object({
  field: z.string(),
  op:    z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'exists']),
  value: z.unknown().optional(),
})
const conditionNode: z.ZodTypeAny = z.lazy(() => z.union([
  z.object({ all: z.array(conditionNode) }),
  z.object({ any: z.array(conditionNode) }),
  z.object({ not: conditionNode }),
  conditionLeaf,
]))

export const chainStepInputSchema = z.object({
  step_index:        z.number().int().min(0),
  name:              z.string().trim().min(1).max(120),
  step_type:         z.enum(['sequential', 'parallel']).default('sequential'),
  parallel_group_id: z.string().uuid().nullable().optional(),
  condition:         conditionNode.nullable().optional(),
  approver_type:     z.enum(['user', 'role', 'hiring_team_member', 'group']),
  approver_value:    z.record(z.string(), z.unknown()),
  min_approvals:     z.number().int().min(1).default(1),
  sla_hours:         z.number().int().min(1).nullable().optional(),
})

export const chainCreateSchema = z.object({
  name:             z.string().trim().min(1).max(200),
  description:      z.string().trim().max(1000).nullable().optional(),
  target_type:      z.enum(['opening', 'job', 'offer']),
  scope_conditions: conditionNode.nullable().optional(),
  is_active:        z.boolean().optional().default(true),
  steps:            z.array(chainStepInputSchema).min(1),
})

export const chainUpdateSchema = z.object({
  name:             z.string().trim().min(1).max(200).optional(),
  description:      z.string().trim().max(1000).nullable().optional(),
  scope_conditions: conditionNode.nullable().optional(),
  is_active:        z.boolean().optional(),
  steps:            z.array(chainStepInputSchema).min(1).optional(),
})

export type ChainCreateInput = z.infer<typeof chainCreateSchema>
