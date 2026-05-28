import { z } from 'zod'

// "Mark joined" flips a pre-hire (pending) employee to active; "terminate" ends
// employment. Creation is never via API — it's a DB-trigger consequence of a
// hire disposition (see migration 047).
export const employeeTransitionSchema = z.object({
  action: z.enum(['join', 'terminate']),
  // ISO date (YYYY-MM-DD) — first working day; defaults to today on join.
  start_date: z.string().nullish(),
})

export type EmployeeTransitionInput = z.infer<typeof employeeTransitionSchema>

// Record a new compensation record. Immutable history: every change is a new
// row (see migration 049). The DB trigger lands a comp_changed event on the
// employee timeline.
export const compensationInsertSchema = z.object({
  effective_date:    z.string(),                                              // YYYY-MM-DD
  base_salary:       z.number().positive('base_salary must be positive'),
  currency:          z.string().length(3).optional(),
  pay_frequency:     z.enum(['annual', 'monthly', 'hourly']).optional(),
  bonus_amount:      z.number().nullish(),
  equity_notes:      z.string().nullish(),
  variable_pay_notes: z.string().nullish(),
  reason:            z.string().nullish(),
})

export type CompensationInsertInput = z.infer<typeof compensationInsertSchema>
