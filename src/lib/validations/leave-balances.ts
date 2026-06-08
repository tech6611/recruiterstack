import { z } from 'zod'

export const leavePolicyUpdateSchema = z.object({
  annual_days: z.number().int().min(0).max(365).optional(),
  description: z.string().trim().max(2000).nullish(),
  is_active:   z.boolean().optional(),
})

export const holidayCreateSchema = z.object({
  date:    z.string(),                                    // YYYY-MM-DD
  name:    z.string().trim().min(1).max(120),
  country: z.string().trim().length(2).nullish(),         // ISO 3166 alpha-2
})

export type LeavePolicyUpdateInput = z.infer<typeof leavePolicyUpdateSchema>
export type HolidayCreateInput     = z.infer<typeof holidayCreateSchema>
