import { z } from 'zod'

export const candidateExportParamsSchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
})

export const applicationExportParamsSchema = z.object({
  job_id: z.string().uuid().optional(),
  status: z.string().optional(),
})
