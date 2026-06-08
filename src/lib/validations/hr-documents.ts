import { z } from 'zod'

export const hrDocumentCreateSchema = z.object({
  employee_id:  z.string().uuid().nullable().optional(),                  // null/omitted = org-level
  title:        z.string().trim().min(1).max(200),
  description:  z.string().trim().max(2000).nullish(),
  category:     z.enum(['offer_letter','id_proof','contract','certification','policy','payslip','tax_form','other']),
  url:          z.string().trim().url(),
  visibility:   z.enum(['employee','admin']).optional(),
  expires_at:   z.string().nullish(),                                      // YYYY-MM-DD
})

// Employees self-upload: a tighter subset (no employee_id; system fills it
// from the calling user's employee_profile; visibility defaults to 'employee').
export const myDocumentCreateSchema = z.object({
  title:        z.string().trim().min(1).max(200),
  description:  z.string().trim().max(2000).nullish(),
  category:     z.enum(['id_proof','certification','other']),
  url:          z.string().trim().url(),
  expires_at:   z.string().nullish(),
})

export const hrDocumentUpdateSchema = z.object({
  title:       z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullish(),
  category:    z.enum(['offer_letter','id_proof','contract','certification','policy','payslip','tax_form','other']).optional(),
  url:         z.string().trim().url().optional(),
  visibility:  z.enum(['employee','admin']).optional(),
  expires_at:  z.string().nullish(),
})

export type HrDocumentCreateInput   = z.infer<typeof hrDocumentCreateSchema>
export type MyDocumentCreateInput   = z.infer<typeof myDocumentCreateSchema>
export type HrDocumentUpdateInput   = z.infer<typeof hrDocumentUpdateSchema>
