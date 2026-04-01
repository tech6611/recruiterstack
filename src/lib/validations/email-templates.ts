import { z } from 'zod'

export const emailTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(50000).optional(),
})

export type EmailTemplateUpdateInput = z.infer<typeof emailTemplateUpdateSchema>
