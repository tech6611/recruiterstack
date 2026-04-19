import { z } from 'zod'

const uuid = z.string().uuid()

const uuidOrNull = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  uuid.nullable(),
)

const dateIsoOrNull = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').nullable(),
)

const compNumOrNull = z.preprocess(
  v => (v === '' || v === undefined || v === null ? null : Number(v)),
  z.number().min(0).nullable(),
)

// Shared field shape — build base object first so both create (with refine)
// and update (partial) share a single source of truth.
const openingBase = z.object({
  title:             z.string().trim().min(1).max(200),
  department_id:     uuidOrNull.optional().default(null),
  location_id:       uuidOrNull.optional().default(null),
  employment_type:   z.enum(['full_time', 'part_time', 'contract', 'intern', 'temp']).default('full_time'),
  comp_min:          compNumOrNull.optional().default(null),
  comp_max:          compNumOrNull.optional().default(null),
  comp_currency:     z.string().trim().length(3).default('USD'),
  comp_band_id:      uuidOrNull.optional().default(null),
  out_of_band:       z.boolean().optional().default(false),
  target_start_date: dateIsoOrNull.optional().default(null),
  hiring_manager_id: uuidOrNull.optional().default(null),
  recruiter_id:      uuidOrNull.optional().default(null),
  justification:     z.string().trim().max(5000).optional().nullable(),
  external_id:       z.string().trim().max(200).optional().nullable(),
  custom_fields:     z.record(z.string(), z.unknown()).optional().default({}),
})

export const openingCreateSchema = openingBase.refine(
  d => d.comp_min === null || d.comp_max === null || d.comp_min <= d.comp_max,
  { message: 'comp_min must be ≤ comp_max', path: ['comp_min'] },
)

// Update: every field optional, no defaults coerced on missing keys.
// Zod's .partial() on the base produces an all-optional object we can
// safely spread in the handler.
export const openingUpdateSchema = openingBase.partial()

export type OpeningCreateInput = z.infer<typeof openingCreateSchema>
export type OpeningUpdateInput = z.infer<typeof openingUpdateSchema>
