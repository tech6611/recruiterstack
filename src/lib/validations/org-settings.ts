import { z } from 'zod'

export const orgSettingsUpdateSchema = z.object({
  slack_webhook_url: z.string().url().nullish(),
})

export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>
