import { z } from 'zod'

// Migration 143 posting fields (visibility, location, comp display, social
// description). Everything is optional so pre-143 clients keep working.
const postingBase = z.object({
  title:        z.string().trim().min(1).max(200),
  description:  z.string().trim().max(50000).nullable().optional(),
  location_text: z.string().trim().max(200).nullable().optional(),
  channel:      z.enum(['careers_page', 'linkedin', 'indeed', 'glassdoor', 'custom']).default('careers_page'),
  channel_config: z.record(z.string(), z.unknown()).optional().default({}),
  // listed = shown on the careers page; unlisted = live but reachable only via its direct link.
  visibility:   z.enum(['listed', 'unlisted']).default('listed'),
  location_id:  z.string().uuid().nullable().optional(),
  // Show the comp range publicly. When true and comp_* are blank, the job's own range is used.
  show_compensation: z.boolean().optional(),
  comp_min:     z.number().nonnegative().nullable().optional(),
  comp_max:     z.number().nonnegative().nullable().optional(),
  comp_currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code, e.g. USD')
    .transform(s => s.toUpperCase()).nullable().optional(),
  // Short blurb for social/link previews (og:description).
  social_description: z.string().trim().max(300).nullable().optional(),
})

function compRangeCheck(v: { comp_min?: number | null; comp_max?: number | null }, ctx: z.RefinementCtx) {
  if (v.comp_min != null && v.comp_max != null && v.comp_min > v.comp_max) {
    ctx.addIssue({ code: 'custom', path: ['comp_max'], message: 'Maximum must be at least the minimum' })
  }
}

export const postingCreateSchema = postingBase.superRefine(compRangeCheck)
export const postingUpdateSchema = postingBase.partial().superRefine(compRangeCheck)

export type PostingCreateInput = z.infer<typeof postingCreateSchema>
export type PostingUpdateInput = z.infer<typeof postingUpdateSchema>

/** Keys added by migration 143. Routes strip these and retry when the live DB
 *  predates the migration (Postgres 42703 undefined_column). */
export const POSTING_143_KEYS = [
  'visibility', 'location_id', 'show_compensation',
  'comp_min', 'comp_max', 'comp_currency', 'social_description',
] as const

export function withoutPosting143Keys<T extends Record<string, unknown>>(row: T): Omit<T, typeof POSTING_143_KEYS[number]> {
  const out = { ...row } as Record<string, unknown>
  for (const k of POSTING_143_KEYS) delete out[k]
  return out as Omit<T, typeof POSTING_143_KEYS[number]>
}
