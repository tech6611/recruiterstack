import { z } from 'zod'
import { roleStatusEnum } from './common'

export const roleUpdateSchema = z.object({
  job_title: z.string().min(1).optional(),
  required_skills: z.array(z.string()).optional(),
  min_experience: z.number().int().min(0).optional(),
  location: z.string().nullish(),
  salary_min: z.number().min(0).nullish(),
  salary_max: z.number().min(0).nullish(),
  status: roleStatusEnum.optional(),
  auto_advance_threshold: z.number().int().min(0).max(100).nullish(),
  auto_reject_threshold: z.number().int().min(0).max(100).nullish(),
})

export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>
