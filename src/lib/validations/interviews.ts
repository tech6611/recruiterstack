import { z } from 'zod'
import { interviewTypeEnum, interviewStatusEnum } from './common'

export const interviewInsertSchema = z.object({
  application_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  hiring_request_id: z.string().uuid(),
  stage_id: z.string().uuid().nullish().default(null),
  interviewer_name: z.string().min(1, 'Interviewer name is required'),
  interview_type: interviewTypeEnum,
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  location: z.string().nullish().default(null),
  notes: z.string().nullish().default(null),
  status: interviewStatusEnum.default('scheduled'),
})

export const interviewUpdateSchema = z.object({
  interviewer_name: z.string().min(1).optional(),
  interview_type: interviewTypeEnum.optional(),
  scheduled_at: z.string().datetime().optional(),
  duration_minutes: z.number().int().min(15).max(480).optional(),
  location: z.string().nullish(),
  notes: z.string().nullish(),
  status: interviewStatusEnum.optional(),
})

export type InterviewInsertInput = z.infer<typeof interviewInsertSchema>
export type InterviewUpdateInput = z.infer<typeof interviewUpdateSchema>
