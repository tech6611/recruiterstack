import { z } from 'zod'

export const memberPatchSchema = z.object({
  role:       z.enum(['admin', 'recruiter', 'hiring_manager', 'interviewer']).optional(),
  is_active:  z.boolean().optional(),
}).refine(data => data.role !== undefined || data.is_active !== undefined, {
  message: 'At least one of role or is_active must be provided',
})

export type MemberPatchInput = z.infer<typeof memberPatchSchema>

// Settings → team invite. RBAC-native: each invite picks an RBAC role by id
// (separate from the legacy onboarding `invitesSchema`, which the bootstrap
// wizard still uses). The route maps Owner → Clerk org:admin, else org:member.
export const teamInviteRowSchema = z.object({
  email:  z.string().email(),
  roleId: z.string().uuid(),
})

export const teamInviteSchema = z.object({
  invites: z.array(teamInviteRowSchema).min(1).max(10),
})

export type TeamInviteRow = z.infer<typeof teamInviteRowSchema>
