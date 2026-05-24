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
