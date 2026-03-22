import { z } from 'zod'
import { stageColorEnum } from './common'

export const scoringCriterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().int().min(1).max(100),
  description: z.string().nullable().default(null),
})

export const pipelineStageInputSchema = z.object({
  name: z.string().min(1),
  color: stageColorEnum,
})

export const hiringRequestInsertSchema = z.object({
  position_title: z.string().min(1, 'Position title is required'),
  department: z.string().optional(),
  hiring_manager_name: z.string().min(1, 'Hiring manager name is required'),
  hiring_manager_email: z.string().email().optional(),
  hiring_manager_slack: z.string().optional(),
  filled_by_recruiter: z.boolean().default(false),
  // Intake fields (Option B)
  team_context: z.string().optional(),
  level: z.string().optional(),
  headcount: z.number().int().min(1).default(1),
  location: z.string().optional(),
  remote_ok: z.boolean().default(false),
  key_requirements: z.string().optional(),
  nice_to_haves: z.string().optional(),
  target_companies: z.string().optional(),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
  target_start_date: z.string().optional(),
  additional_notes: z.string().optional(),
  generated_jd: z.string().optional(),
  // Pipeline & scoring
  pipeline_stages: z.array(pipelineStageInputSchema).optional(),
  scoring_criteria: z.array(scoringCriterionSchema).optional(),
}).refine(
  data => data.filled_by_recruiter || data.hiring_manager_email,
  { message: 'hiring_manager_email is required when sending to hiring manager', path: ['hiring_manager_email'] },
)

export const hiringRequestUpdateSchema = z.object({
  position_title: z.string().min(1).optional(),
  department: z.string().nullish(),
  hiring_manager_name: z.string().min(1).optional(),
  hiring_manager_email: z.string().email().nullish(),
  hiring_manager_slack: z.string().nullish(),
  status: z.string().optional(),
  team_context: z.string().nullish(),
  level: z.string().nullish(),
  headcount: z.number().int().min(1).optional(),
  location: z.string().nullish(),
  remote_ok: z.boolean().optional(),
  key_requirements: z.string().nullish(),
  nice_to_haves: z.string().nullish(),
  target_companies: z.string().nullish(),
  budget_min: z.number().nullish(),
  budget_max: z.number().nullish(),
  target_start_date: z.string().nullish(),
  additional_notes: z.string().nullish(),
  generated_jd: z.string().nullish(),
  scoring_criteria: z.array(scoringCriterionSchema).nullish(),
})

export type HiringRequestInsertInput = z.infer<typeof hiringRequestInsertSchema>
export type HiringRequestUpdateInput = z.infer<typeof hiringRequestUpdateSchema>
