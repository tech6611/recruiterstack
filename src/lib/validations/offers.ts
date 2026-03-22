import { z } from 'zod'
import { offerStatusEnum } from './common'

export const offerInsertSchema = z.object({
  application_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  hiring_request_id: z.string().uuid(),
  position_title: z.string().min(1, 'Position title is required'),
  base_salary: z.number().positive().nullish().default(null),
  bonus: z.number().min(0).nullish().default(null),
  equity: z.string().nullish().default(null),
  start_date: z.string().nullish().default(null),
  expiry_date: z.string().nullish().default(null),
  notes: z.string().nullish().default(null),
  offer_letter_text: z.string().nullish().default(null),
  status: offerStatusEnum.default('draft'),
  created_by: z.string().nullish().default(null),
})

export const offerUpdateSchema = z.object({
  position_title: z.string().min(1).optional(),
  base_salary: z.number().positive().nullish(),
  bonus: z.number().min(0).nullish(),
  equity: z.string().nullish(),
  start_date: z.string().nullish(),
  expiry_date: z.string().nullish(),
  notes: z.string().nullish(),
  offer_letter_text: z.string().nullish(),
  status: offerStatusEnum.optional(),
  approved_by: z.string().nullish(),
})

export type OfferInsertInput = z.infer<typeof offerInsertSchema>
export type OfferUpdateInput = z.infer<typeof offerUpdateSchema>
