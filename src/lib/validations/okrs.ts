import { z } from 'zod'

export const okrCreateSchema = z.object({
  title:       z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).nullish(),
  cycle:       z.string().trim().min(1).max(40),
  status:      z.enum(['draft','active','achieved','missed','abandoned']).optional(),
})

export const okrUpdateSchema = z.object({
  title:       z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(4000).nullish(),
  cycle:       z.string().trim().min(1).max(40).optional(),
  status:      z.enum(['draft','active','achieved','missed','abandoned']).optional(),
  sort_order:  z.number().int().min(0).optional(),
})

export const krCreateSchema = z.object({
  title:         z.string().trim().min(1).max(300),
  description:   z.string().trim().max(4000).nullish(),
  progress:      z.number().int().min(0).max(100).optional(),
  target_metric: z.string().trim().max(300).nullish(),
  sort_order:    z.number().int().min(0).optional(),
})

export const krUpdateSchema = z.object({
  title:         z.string().trim().min(1).max(300).optional(),
  description:   z.string().trim().max(4000).nullish(),
  progress:      z.number().int().min(0).max(100).optional(),
  target_metric: z.string().trim().max(300).nullish(),
  sort_order:    z.number().int().min(0).optional(),
})
