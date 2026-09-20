import { z } from 'zod'

const kinds = ['school', 'employer_current', 'employer_past', 'employer_any', 'title_current', 'title_any', 'seniority', 'function', 'years_band', 'grad_year_band', 'location', 'skill', 'industry', 'company_size', 'company_type', 'funding_stage'] as const

export const searchCriterionSchema = z.object({
  id: z.string().min(1).max(60),
  kind: z.enum(kinds),
  values: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
  min: z.number().min(0).max(100).nullish(),
  max: z.number().min(0).max(100).nullish(),
  radius_km: z.number().min(1).max(2000).nullish(),
  exclude: z.boolean().optional(),
  label: z.string().trim().max(120).nullish(),
})

export const searchLevelSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(160),
  criteria: z.array(searchCriterionSchema).max(12),
  relaxes: z.string().trim().max(240).nullish(),
  rationale: z.string().trim().max(500).nullish(),
})

export const searchSpecSchema = z.object({
  version: z.literal(1),
  base: z.array(searchCriterionSchema).max(12),
  levels: z.array(searchLevelSchema).max(16),
  post_fetch: z.array(z.object({ label: z.string().trim().min(1).max(240), how: z.enum(['judge', 'screen', 'local']), note: z.string().trim().max(500).nullish() })).max(30).default([]),
  source: z.enum(['brief', 'edited']),
  edited_at: z.string().nullish(),
})
export type SearchSpecParsed = z.infer<typeof searchSpecSchema>
