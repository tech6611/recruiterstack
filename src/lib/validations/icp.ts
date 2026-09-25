import { z } from 'zod'
import { CRITERION_KIND_LABEL, type CriterionKind } from '@/lib/types/search-spec'

// Validation for the editable ICP draft payload (migration 104_icp.sql).
// Kept structurally aligned with IcpDraftInput in src/lib/types/icp.ts.

// The criterion kinds, derived from the single source of truth so this list can't
// drift from the type. Used to validate a structured must-have's `kind`.
const CRITERION_KINDS = Object.keys(CRITERION_KIND_LABEL) as [CriterionKind, ...CriterionKind[]]

export const icpMustHaveSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  // A must-have is now just its plain-English question — the Fit Engine judge reads
  // the `label` and rules pass/fail from the candidate's history. attribute/operator/
  // value are legacy metadata (empty for new gates; kept for old ICPs & templates), so
  // they are OPTIONAL and may be empty — requiring them here rejected label-only gates
  // and broke ICP save/approve.
  attribute: z.string().trim().max(60).default(''),
  operator: z.string().trim().max(30).default(''),
  value: z.union([z.string().max(500), z.number(), z.array(z.string().max(200))]).default(''),
  // Structured must-have (docs/structured-must-haves-plan.md): when `kind` is set, this
  // must-have IS a SearchCriterion — the same object the search plan sends to a vendor and
  // the ideal-profile tiles render. These MUST be preserved through save/approve; omitting
  // them here made Zod silently strip them, downgrading structured must-haves to plain text
  // (and hiding the tiles after approval). All optional — legacy gates carry none.
  kind: z.enum(CRITERION_KINDS).optional(),
  values: z.array(z.string().max(200)).max(50).optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  radius_km: z.number().nullable().optional(),
  exclude: z.boolean().optional(),
  relax_at: z.number().int().nullable().optional(),
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
  source: z.enum(['seed', 'intake', 'refinement', 'manual', 'template']).optional(),
})

export type IcpDraftInputParsed = z.infer<typeof icpDraftInputSchema>

/** PATCH payload: the recruiter's corrections to the ICP's recruiter brief. Free text —
 *  it is house knowledge fed back into the prompt verbatim, not structured data. */
export const icpRecruiterCorrectionsSchema = z.object({
  recruiter_corrections: z.string().trim().max(4000),
})
