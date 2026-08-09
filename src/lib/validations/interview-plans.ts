import { z } from 'zod'

export const interviewTypeEnum = z.enum([
  'video', 'phone', 'in_person', 'panel', 'technical', 'assessment',
])

export const interviewRoundInputSchema = z.object({
  name: z.string().min(1, 'Round name is required').max(120),
  interview_type: interviewTypeEnum.default('video'),
  duration_minutes: z.number().int().min(5).max(600).default(45),
  interviewer_role: z.string().max(120).nullish(),
  interviewer_user_id: z.string().uuid().nullish(),
  interviewer_name: z.string().max(160).nullish(),
  stage_id: z.string().uuid().nullish(),
  scorecard_id: z.string().uuid().nullish(),
})

/** Full-plan save: the client sends the complete, ordered list of rounds. */
export const interviewPlanPutSchema = z.object({
  rounds: z.array(interviewRoundInputSchema).max(20),
})

export type InterviewRoundInputParsed = z.infer<typeof interviewRoundInputSchema>
