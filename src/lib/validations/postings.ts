import { z } from 'zod'

const postingBase = z.object({
  title:        z.string().trim().min(1).max(200),
  description:  z.string().trim().max(50000).nullable().optional(),
  location_text: z.string().trim().max(200).nullable().optional(),
  channel:      z.enum(['careers_page', 'linkedin', 'indeed', 'glassdoor', 'custom']).default('careers_page'),
  channel_config: z.record(z.string(), z.unknown()).optional().default({}),
})

export const postingCreateSchema = postingBase
export const postingUpdateSchema = postingBase.partial()

export type PostingCreateInput = z.infer<typeof postingCreateSchema>
