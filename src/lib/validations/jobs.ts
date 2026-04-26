import { z } from 'zod'

const uuidOrNull = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  z.string().uuid().nullable(),
)

const jobBase = z.object({
  title:             z.string().trim().min(1).max(200),
  department_id:     uuidOrNull.optional().default(null),
  description:       z.string().trim().max(20000).nullable().optional(),
  hiring_team_id:    uuidOrNull.optional().default(null),
  confidentiality:   z.enum(['public', 'confidential']).default('public'),
  custom_fields:     z.record(z.string(), z.unknown()).optional().default({}),
})

export const jobCreateSchema = jobBase
export const jobUpdateSchema = jobBase.partial()

export type JobCreateInput = z.infer<typeof jobCreateSchema>
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>

export const linkOpeningSchema = z.object({
  opening_id: z.string().uuid(),
})
