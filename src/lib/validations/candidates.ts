import { z } from 'zod'
import { candidateStatusEnum } from './common'

export const candidateInsertSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').transform(v => v.toLowerCase()),
  phone: z.string().nullish().default(null),
  resume_url: z.string().url().nullish().default(null),
  skills: z.array(z.string()).default([]),
  experience_years: z.number().int().min(0).default(0),
  current_title: z.string().nullish().default(null),
  location: z.string().nullish().default(null),
  linkedin_url: z.string().url().nullish().default(null),
  status: candidateStatusEnum.default('active'),
})

export const candidateUpdateSchema = candidateInsertSchema.partial()

export type CandidateInsertInput = z.infer<typeof candidateInsertSchema>
export type CandidateUpdateInput = z.infer<typeof candidateUpdateSchema>
