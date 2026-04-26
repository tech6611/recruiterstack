import { z } from 'zod'

const uuidOrNull = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  z.string().uuid().nullable(),
)

// ── Departments ────────────────────────────────────────────────

export const departmentCreateSchema = z.object({
  name:      z.string().trim().min(1).max(120),
  slug:      z.string().trim().max(120).optional().nullable(),
  parent_id: uuidOrNull.optional().default(null),
  is_active: z.boolean().optional().default(true),
})
export const departmentUpdateSchema = departmentCreateSchema.partial()

// ── Locations ──────────────────────────────────────────────────

export const locationCreateSchema = z.object({
  name:        z.string().trim().min(1).max(120),
  city:        z.string().trim().max(120).optional().nullable(),
  state:       z.string().trim().max(120).optional().nullable(),
  country:     z.string().trim().max(2).optional().nullable(),     // ISO alpha-2
  postal_code: z.string().trim().max(20).optional().nullable(),
  remote_type: z.enum(['onsite', 'remote', 'hybrid']).default('onsite'),
  timezone:    z.string().trim().max(60).optional().nullable(),
  is_active:   z.boolean().optional().default(true),
})
export const locationUpdateSchema = locationCreateSchema.partial()

// ── Compensation bands ─────────────────────────────────────────

const moneyNum = z.preprocess(v => Number(v), z.number().min(0))

export const compBandCreateSchema = z.object({
  name:          z.string().trim().min(1).max(120),
  level:         z.string().trim().min(1).max(40),
  department_id: uuidOrNull.optional().default(null),
  location_id:   uuidOrNull.optional().default(null),
  min_salary:    moneyNum,
  max_salary:    moneyNum,
  currency:      z.string().trim().length(3).default('USD'),
  is_active:     z.boolean().optional().default(true),
}).refine(d => d.min_salary <= d.max_salary, {
  message: 'min_salary must be ≤ max_salary',
  path: ['min_salary'],
})

const compBandBase = z.object({
  name:          z.string().trim().min(1).max(120),
  level:         z.string().trim().min(1).max(40),
  department_id: uuidOrNull.optional(),
  location_id:   uuidOrNull.optional(),
  min_salary:    moneyNum,
  max_salary:    moneyNum,
  currency:      z.string().trim().length(3),
  is_active:     z.boolean(),
})
export const compBandUpdateSchema = compBandBase.partial()

export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>
export type LocationCreateInput   = z.infer<typeof locationCreateSchema>
export type CompBandCreateInput   = z.infer<typeof compBandCreateSchema>
