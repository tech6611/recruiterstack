import { z } from 'zod'

export const timeOffCreateSchema = z.object({
  request_type: z.enum(['vacation', 'sick', 'personal', 'unpaid']),
  start_date:   z.string(),                                    // YYYY-MM-DD
  end_date:     z.string(),                                    // YYYY-MM-DD
  hours_total:  z.number().positive().nullish(),
  reason:       z.string().trim().max(2000).nullish(),
})

export const timeOffDecisionSchema = z.object({
  action: z.enum(['approve', 'reject', 'cancel']),
  note:   z.string().trim().max(2000).nullish(),
})

export type TimeOffCreateInput   = z.infer<typeof timeOffCreateSchema>
export type TimeOffDecisionInput = z.infer<typeof timeOffDecisionSchema>
