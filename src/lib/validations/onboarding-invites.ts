import { z } from 'zod'

export const inviteRowSchema = z.object({
  email: z.string().trim().email(),
  role:  z.enum(['admin', 'recruiter', 'hiring_manager', 'interviewer']),
})

export const invitesSchema = z.object({
  invites: z.array(inviteRowSchema).max(10),
})

export type InviteRow    = z.infer<typeof inviteRowSchema>
export type InvitesInput = z.infer<typeof invitesSchema>
