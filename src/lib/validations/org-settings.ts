import { z } from 'zod'

export const orgSettingsUpdateSchema = z.object({
  slack_webhook_url: z.string().url().nullish(),
  // Admin-only fields (enforced in the handler, not the schema)
  company_name:   z.string().trim().min(1).max(200).optional(),
  company_size:   z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional(),
  industry:       z.string().trim().max(100).nullable().optional().or(z.literal('').transform(() => null)),
  website:        z.string().trim().url().nullable().optional().or(z.literal('').transform(() => null)),
  enabled_agents: z.array(z.enum(['drafter', 'scout', 'sifter', 'scheduler', 'closer'])).min(1).optional(),
})

export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>
