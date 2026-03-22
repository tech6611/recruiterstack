import { z } from 'zod'
import { applicationSourceEnum, applicationStatusEnum } from './common'

export const applicationInsertSchema = z.object({
  hiring_request_id: z.string().uuid('hiring_request_id is required'),
  candidate_id: z.string().uuid().optional(),
  candidate_data: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email().transform(v => v.toLowerCase()),
    phone: z.string().nullish(),
    current_title: z.string().nullish(),
    location: z.string().nullish(),
  }).optional(),
  stage_id: z.string().uuid().optional(),
  source: applicationSourceEnum.default('manual'),
  source_detail: z.string().nullish(),
}).refine(
  data => data.candidate_id || data.candidate_data,
  { message: 'Either candidate_id or candidate_data is required' },
)

export const applicationUpdateSchema = z.object({
  stage_id: z.string().uuid().optional(),
  status: applicationStatusEnum.optional(),
  source: applicationSourceEnum.optional(),
  source_detail: z.string().nullish(),
})

/** Public apply form submission (no auth required) */
export const publicApplySchema = z.object({
  token: z.string().min(1, 'Token is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').transform(v => v.toLowerCase()),
  phone: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  cover_letter: z.string().optional(),
  cv_url: z.string().url().optional(),
})

export type ApplicationInsertInput = z.infer<typeof applicationInsertSchema>
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>
export type PublicApplyInput = z.infer<typeof publicApplySchema>
