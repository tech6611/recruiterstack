import { z } from 'zod'

export const uuidSchema = z.string().uuid()

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// ── Shared Enums ───────────────────────────────────────────────────────────────

export const candidateStatusEnum = z.enum([
  'active', 'inactive', 'interviewing', 'offer_extended', 'hired', 'rejected',
])

export const roleStatusEnum = z.enum(['draft', 'active', 'paused', 'closed'])

export const hiringRequestStatusEnum = z.enum([
  'intake_pending', 'intake_submitted', 'jd_generated', 'jd_sent', 'jd_approved', 'posted', 'closed',
])

export const applicationStatusEnum = z.enum(['active', 'rejected', 'withdrawn', 'hired'])

export const applicationSourceEnum = z.enum(['manual', 'applied', 'imported', 'sourced', 'referral'])

export const aiRecommendationEnum = z.enum(['strong_yes', 'yes', 'maybe', 'no'])

export const interviewTypeEnum = z.enum([
  'video', 'phone', 'in_person', 'panel', 'technical', 'assessment',
])

export const interviewStatusEnum = z.enum([
  'scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled',
])

export const offerStatusEnum = z.enum([
  'draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'withdrawn', 'expired',
])

export const stageColorEnum = z.enum([
  'slate', 'blue', 'violet', 'amber', 'emerald', 'green', 'red', 'pink',
])

export const taskStatusEnum = z.enum(['to_do', 'in_progress', 'done', 'blocked'])
