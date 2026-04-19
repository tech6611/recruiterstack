import { z } from 'zod'

export const profileSchema = z.object({
  first_name: z.string().trim().min(1).max(120),
  last_name:  z.string().trim().max(120).optional().nullable(),
})

export const roleSchema = z.object({
  role: z.enum(['admin', 'recruiter', 'hiring_manager', 'interviewer']),
})

export const orgInfoSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  company_size: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']),
  industry:     z.string().trim().max(100).optional().nullable(),
  website:      z.string().trim().url().optional().nullable().or(z.literal('').transform(() => null)),
})

export const modulesSchema = z.object({
  enabled_agents: z.array(z.enum(['drafter', 'scout', 'sifter', 'scheduler', 'closer'])).min(1),
})

export type ProfileInput  = z.infer<typeof profileSchema>
export type RoleInput     = z.infer<typeof roleSchema>
export type OrgInfoInput  = z.infer<typeof orgInfoSchema>
export type ModulesInput  = z.infer<typeof modulesSchema>
