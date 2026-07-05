import { z } from 'zod'

// Slug: lowercase letters, numbers, hyphens; 3–40 chars; no leading/trailing hyphen.
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// Reserved words that can't be used as a careers slug (would collide with app routes).
export const RESERVED_SLUGS = new Set([
  'api', 'app', 'admin', 'apply', 'intake', 'schedule', 'careers', 'settings',
  'sign-in', 'sign-up', 'dashboard', 'pricing', 'features', 'about', 'blog',
  'www', 'mail', 'support', 'help', 'docs', 'status',
])

const emptyToNull = (schema: z.ZodTypeAny) =>
  schema.nullable().optional().or(z.literal('').transform(() => null))

// Hex color like #1a2b3c or #abc.
const hexColor = z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex color like #2563eb')

// A link target for a nav link/CTA — absolute URL, relative path, or #anchor.
// Blocks javascript:/data: schemes so a stored link can't inject script.
const safeHref = z.string().trim().max(300)
  .refine(s => !/^\s*(javascript|data|vbscript):/i.test(s), 'That link is not allowed')

// One top-nav link: a short label pointing at a safe href.
const navLink = z.object({
  label: z.string().trim().min(1, 'Add a label').max(40),
  url:   safeHref.pipe(z.string().min(1, 'Add a link')),
})

export const orgSettingsUpdateSchema = z.object({
  slack_webhook_url: z.string().url().nullish(),
  // Admin-only fields (enforced in the handler, not the schema)
  company_name:   z.string().trim().min(1).max(200).optional(),
  company_size:   z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional(),
  industry:       z.string().trim().max(100).nullable().optional().or(z.literal('').transform(() => null)),
  website:        z.string().trim().url().nullable().optional().or(z.literal('').transform(() => null)),
  enabled_agents: z.array(z.enum(['drafter', 'scout', 'sifter', 'scheduler', 'closer'])).min(1).optional(),
  // Careers page branding (admin-only; migration 071)
  careers_slug:   z.string().trim().toLowerCase().min(3).max(40).regex(slugRegex, 'Use lowercase letters, numbers, and hyphens')
                    .refine(s => !RESERVED_SLUGS.has(s), 'That name is reserved — pick another')
                    .nullable().optional().or(z.literal('').transform(() => null)),
  careers_public: z.boolean().optional(),
  logo_url:       emptyToNull(z.string().trim().url()),
  hero_image_url: emptyToNull(z.string().trim().url()),
  brand_color:    emptyToNull(hexColor),
  accent_color:   emptyToNull(hexColor),
  brand_font:     emptyToNull(z.string().trim().max(60)),
  tagline:        emptyToNull(z.string().trim().max(160)),
  about:          emptyToNull(z.string().trim().max(12000)), // rich HTML now, so allow markup overhead
  // Careers hero copy + top-nav config + footer toggle (migration 077)
  hero_headline:    emptyToNull(z.string().trim().max(80)),
  hero_subheadline: emptyToNull(z.string().trim().max(200)),
  nav_links:        z.array(navLink).max(6).optional(),
  nav_cta_label:    emptyToNull(z.string().trim().max(30)),
  nav_cta_url:      emptyToNull(safeHref),
  show_powered_by:  z.boolean().optional(),
})

export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>
