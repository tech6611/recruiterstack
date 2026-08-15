import { z } from 'zod'

// Validation for the editable ICP draft payload (migration 104_icp.sql).
// Kept structurally aligned with IcpDraftInput in src/lib/types/icp.ts.

export const icpMustHaveSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  attribute: z.string().trim().min(1).max(60),
  operator: z.string().trim().min(1).max(30),
  value: z.union([z.string().max(500), z.number(), z.array(z.string().max(200))]),
})

export const icpCompetencySchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  weight: z.number().int().min(0).max(100),
  description: z.string().trim().max(500).optional(),
  verbatim: z.string().trim().max(1000).optional(),
  behaviours: z.array(z.string().trim().max(500)).max(20).default([]),
  anchors: z
    .object({
      '1': z.string().max(300),
      '2': z.string().max(300),
      '3': z.string().max(300),
      '4': z.string().max(300),
    })
    .optional(),
})

export const icpDraftInputSchema = z.object({
  must_haves: z.array(icpMustHaveSchema).max(20).default([]),
  competencies: z.array(icpCompetencySchema).max(20).default([]),
  source: z.enum(['seed', 'intake', 'refinement', 'manual']).optional(),
})

export type IcpDraftInputParsed = z.infer<typeof icpDraftInputSchema>
