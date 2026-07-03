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
  // Resume-autofill enrichment (Phase 2). These come from parsing the uploaded
  // CV and are stored on the candidate profile so the recruiter's dashboard
  // arrives pre-filled. They're relayed by the client, so we bound every field
  // to keep a tampered payload harmless; they were already grounded (checked
  // against the resume text) server-side by /api/apply/parse-cv.
  current_title: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  skills: z.array(z.string().min(1).max(80)).max(20).optional(),
  experience_years: z.number().int().min(0).max(60).optional(),
  // Custom screening-question answers (Publish JD Phase 3c). The label is
  // resolved server-side from the job's form, so the client only sends the
  // field id + the candidate's value.
  screening_answers: z.array(z.object({
    field_id: z.string().min(1),
    value: z.union([z.string(), z.array(z.string()), z.null()]),
  })).max(100).optional(),
})

export type ApplicationInsertInput = z.infer<typeof applicationInsertSchema>
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>
export type PublicApplyInput = z.infer<typeof publicApplySchema>
