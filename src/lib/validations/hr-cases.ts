import { z } from 'zod'

export const hrCaseCreateSchema = z.object({
  category: z.enum(['leave', 'comp', 'benefits', 'docs', 'manager', 'onboarding', 'other']),
  subject:  z.string().trim().min(3).max(200),
  body:     z.string().trim().min(3).max(8000),
})

export const hrCaseMessageSchema = z.object({
  body: z.string().trim().min(1).max(8000),
})

export const hrCaseUpdateSchema = z.object({
  status:                z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  assigned_to_user_id:   z.string().uuid().nullable().optional(),
})

export type HrCaseCreateInput  = z.infer<typeof hrCaseCreateSchema>
export type HrCaseMessageInput = z.infer<typeof hrCaseMessageSchema>
export type HrCaseUpdateInput  = z.infer<typeof hrCaseUpdateSchema>
