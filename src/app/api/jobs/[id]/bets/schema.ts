import { z } from 'zod'
import { CRITERION_KIND_LABEL, type CriterionKind } from '@/lib/types/search-spec'

const KINDS = Object.keys(CRITERION_KIND_LABEL) as [CriterionKind, ...CriterionKind[]]

/**
 * A bet's lines as the Scoring editor holds them (possibly unsaved). Looser than the
 * search-plan schema on purpose: profile labels run to 200 characters and a graduation
 * year is not a 0–100 number.
 */
export const betCriterionSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(KINDS),
  values: z.array(z.string().max(200)).max(60).default([]),
  min: z.number().nullish(),
  max: z.number().nullish(),
  radius_km: z.number().nullish(),
  exclude: z.boolean().optional(),
  label: z.string().max(300).nullish(),
  relax_at: z.number().int().nullish(),
  bet: z.number().int().nullish(),
  bet_label: z.string().max(200).nullish(),
  bet_order: z.number().int().nullish(),
})

export const betBodySchema = z.object({
  bet: z.number().int().min(1).max(10),
  criteria: z.array(betCriterionSchema).max(40),
})
