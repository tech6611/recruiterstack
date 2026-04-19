import { z } from 'zod'

export const memberPatchSchema = z.object({
  role:       z.enum(['admin', 'recruiter', 'hiring_manager', 'interviewer']).optional(),
  is_active:  z.boolean().optional(),
}).refine(data => data.role !== undefined || data.is_active !== undefined, {
  message: 'At least one of role or is_active must be provided',
})

export type MemberPatchInput = z.infer<typeof memberPatchSchema>
