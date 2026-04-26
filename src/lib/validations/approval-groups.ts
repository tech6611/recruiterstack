import { z } from 'zod'

export const groupCreateSchema = z.object({
  name:        z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  is_active:   z.boolean().optional().default(true),
})
export const groupUpdateSchema = groupCreateSchema.partial()

export const groupMembersSetSchema = z.object({
  user_ids: z.array(z.string().uuid()),
})
