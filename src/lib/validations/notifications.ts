import { z } from 'zod'

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).optional(),
  all: z.literal(true).optional(),
}).refine(
  data => (data.ids && data.ids.length > 0) || data.all === true,
  { message: 'Provide either ids (array of UUIDs) or all: true' },
)

export type MarkReadInput = z.infer<typeof markReadSchema>
