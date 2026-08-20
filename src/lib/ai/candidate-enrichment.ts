/**
 * Candidate Enrichment (Sourcing Brain, Slice 0).
 *
 * Reads a résumé and extracts the canonical structured profile the pool needs —
 * most importantly a DATED work history, which the old parsers flattened away.
 * The dated history powers the "movability / trajectory" read the reasoning brain
 * uses. Pure helpers (date normalization, movability math, prompt) are unit-tested;
 * the LLM call wraps them. Source-agnostic: the same shape a bought vendor record
 * will conform to.
 */

import { z } from 'zod'
import { generateFromPdf } from '@/lib/ai/llm'
import { parseAiJson } from '@/lib/ai/parse-ai-response'
import { withRetry } from '@/lib/ai/retry'
import { trackUsage, type UsageIdentity } from '@/lib/ai/track-usage'

export interface EnrichedExperience {
  title: string | null
  employer: string | null
  location: string | null
  start_date: string | null // YYYY-MM-DD (first of month) or null
  end_date: string | null
  is_current: boolean
  summary: string | null
}
// ISCED-aligned academic ladder (low → high), used as EVIDENCE the recruiter-brain
// reasons over — never a rigid filter. `professional_cert` sits off the academic ladder.
export const EDUCATION_LEVELS = [
  'secondary', 'senior_secondary', 'diploma', 'undergraduate', 'postgraduate', 'doctorate',
] as const
export type EducationLevel = (typeof EDUCATION_LEVELS)[number] | 'professional_cert'

export interface EnrichedEducation {
  degree: string | null
  field: string | null
  school: string | null
  year: number | null
  level: EducationLevel | null // normalized rung (undergraduate, postgraduate, …)
  status: 'completed' | 'ongoing' | null
}

const LEVEL_RANK: Record<string, number> = {
  secondary: 1, senior_secondary: 2, diploma: 3, undergraduate: 4, postgraduate: 5, doctorate: 6,
}

/** Map a loose degree/level string to the normalized ladder — handles Indian +
 *  international vocabulary (SSC/HSC/matriculation, A-levels, US diploma, …). PURE. */
export function normalizeEducationLevel(raw: string | null | undefined): EducationLevel | null {
  const s = (raw ?? '').toLowerCase().trim()
  if (!s) return null
  if ((EDUCATION_LEVELS as readonly string[]).includes(s) || s === 'professional_cert') return s as EducationLevel
  if (/ph\.?d|doctora|dphil/.test(s)) return 'doctorate'
  if (/master|m\.?tech|m\.?sc|m\.?a\b|m\.?com|mba|pgdm|pg\s*diploma|post.?grad|masters/.test(s)) return 'postgraduate'
  if (/bachelor|b\.?tech|b\.?e\b|b\.?sc|b\.?a\b|b\.?com|bba|bca|under.?grad|llb|mbbs/.test(s)) return 'undergraduate'
  if (/diploma|associate|polytechnic/.test(s)) return 'diploma'
  if (/12th|xii|class\s*12|hsc|higher secondary|senior secondary|intermediate|a-?level|high school/.test(s)) return 'senior_secondary'
  if (/10th|\bx\b|class\s*10|ssc|matric|secondary school|o-?level/.test(s)) return 'secondary'
  if (/certif|licen|credential|nanodegree|bootcamp/.test(s)) return 'professional_cert'
  return null
}

/** The highest ACADEMIC level attained (professional certs excluded). PURE + tested. */
export function highestEducationLevel(education: { level?: EducationLevel | null }[]): EducationLevel | null {
  let best: EducationLevel | null = null
  let bestRank = 0
  for (const e of education ?? []) {
    const r = e.level ? LEVEL_RANK[e.level] ?? 0 : 0
    if (r > bestRank) { bestRank = r; best = e.level ?? null }
  }
  return best
}

const enrichmentSchema = z.object({
  current_title: z.string().nullish(),
  current_company: z.string().nullish(),
  location: z.string().nullish(),
  experience_years: z.number().nullish(),
  skills: z.array(z.string()).default([]),
  experiences: z
    .array(
      z.object({
        title: z.string().nullish(),
        employer: z.string().nullish(),
        location: z.string().nullish(),
        start: z.string().nullish(), // "YYYY-MM" | "YYYY" | null
        end: z.string().nullish(),   // "YYYY-MM" | "YYYY" | "present" | null
        is_current: z.boolean().default(false),
        summary: z.string().nullish(),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string().nullish(),
        field: z.string().nullish(),
        school: z.string().nullish(),
        year: z.number().nullish(),
        level: z.string().nullish(),  // normalized in toEnrichedProfile (robust to loose LLM output)
        status: z.string().nullish(), // "completed" | "ongoing"
      }),
    )
    .default([]),
})
export type EnrichmentRaw = z.infer<typeof enrichmentSchema>

export interface EnrichedProfile {
  current_title: string | null
  current_company: string | null
  location: string | null
  experience_years: number | null
  skills: string[]
  experiences: EnrichedExperience[]
  education: EnrichedEducation[]
}

/** Normalize a loose résumé date ("2019", "Jan 2019", "2019-03", "Present") to a
 *  YYYY-MM-DD string (first of the month) or null. PURE + tested. */
export function normalizeMonth(value: string | null | undefined): string | null {
  const s = (value ?? '').trim()
  if (!s || /present|current|now|ongoing/i.test(s)) return null

  let m = s.match(/^(\d{4})[-/](\d{1,2})/) // YYYY-MM or YYYY/MM (optionally -DD)
  if (m) {
    const mm = Math.min(12, Math.max(1, parseInt(m[2], 10)))
    return `${m[1]}-${String(mm).padStart(2, '0')}-01`
  }
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  m = s.match(/([a-z]{3,})[\s.,-]+(\d{4})/i) // "Jan 2019" / "January 2019"
  if (m) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, '0')}-01`
  }
  m = s.match(/(^|[^\d])(\d{4})([^\d]|$)/) // bare year
  if (m) return `${m[2]}-01-01`
  return null
}

function monthsBetween(a: string, b: Date): number {
  const d = new Date(a)
  return (b.getFullYear() - d.getFullYear()) * 12 + (b.getMonth() - d.getMonth())
}

export interface Movability {
  num_roles: number
  current_tenure_months: number | null
  total_experience_months: number | null
  avg_tenure_months: number | null
  last_move_months_ago: number | null
}

/** Derive tenure / trajectory signals from a dated history. PURE + tested. */
export function deriveMovability(experiences: EnrichedExperience[], now: Date): Movability {
  const withStart = experiences.filter((e) => e.start_date)
  const num_roles = experiences.length
  if (withStart.length === 0) {
    return { num_roles, current_tenure_months: null, total_experience_months: null, avg_tenure_months: null, last_move_months_ago: null }
  }
  // Most recent first, by start date.
  const sorted = [...withStart].sort((a, b) => (a.start_date! < b.start_date! ? 1 : -1))
  const mostRecent = sorted.find((e) => e.is_current) ?? sorted[0]
  const earliest = sorted[sorted.length - 1]

  const current_tenure_months = mostRecent.start_date ? Math.max(0, monthsBetween(mostRecent.start_date, now)) : null
  const total_experience_months = earliest.start_date ? Math.max(0, monthsBetween(earliest.start_date, now)) : null
  const last_move_months_ago = sorted[0].start_date ? Math.max(0, monthsBetween(sorted[0].start_date, now)) : null
  const avg_tenure_months = total_experience_months != null && num_roles > 0 ? Math.round(total_experience_months / num_roles) : null

  return { num_roles, current_tenure_months, total_experience_months, avg_tenure_months, last_move_months_ago }
}

/** Fold the raw LLM output into the stored shape (normalized dates). PURE + tested. */
export function toEnrichedProfile(raw: EnrichmentRaw): EnrichedProfile {
  const experiences: EnrichedExperience[] = (raw.experiences ?? []).map((e) => {
    const start_date = normalizeMonth(e.start)
    const endRaw = normalizeMonth(e.end)
    const is_current = e.is_current || /present|current|now|ongoing/i.test(e.end ?? '')
    return {
      title: clean(e.title),
      employer: clean(e.employer),
      location: clean(e.location),
      start_date,
      end_date: is_current ? null : endRaw,
      is_current,
      summary: clean(e.summary),
    }
  })
  return {
    current_title: clean(raw.current_title),
    current_company: clean(raw.current_company),
    location: clean(raw.location),
    experience_years: typeof raw.experience_years === 'number' ? raw.experience_years : null,
    skills: (raw.skills ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 30),
    experiences,
    education: (raw.education ?? []).map((ed) => {
      const status = clean(ed.status)?.toLowerCase()
      return {
        degree: clean(ed.degree),
        field: clean(ed.field),
        school: clean(ed.school),
        year: typeof ed.year === 'number' ? ed.year : null,
        // Trust the model's level; fall back to inferring from the degree name.
        level: normalizeEducationLevel(ed.level) ?? normalizeEducationLevel(ed.degree),
        status: status === 'ongoing' ? 'ongoing' : status === 'completed' ? 'completed' : null,
      }
    }),
  }
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length ? t : null
}

export function buildCandidateEnrichmentPrompt(): string {
  return `Extract the candidate's full structured profile from this résumé. Include EVERY distinct role in the work history with its dates — not just the current one. Return ONLY valid JSON (no markdown):
{
  "current_title": "<most recent job title or null>",
  "current_company": "<most recent employer or null>",
  "location": "<city, country or null>",
  "experience_years": <total years of professional experience as a number, or null>,
  "skills": [<technical skills, tools, methodologies — max 30>],
  "experiences": [
    { "title": "", "employer": "", "location": "", "start": "YYYY-MM or YYYY", "end": "YYYY-MM or YYYY or present", "is_current": false, "summary": "<one line, optional>" }
  ],
  "education": [ { "degree": "", "field": "", "school": "", "year": <graduation year or null>, "level": "", "status": "" } ]
}
Rules: order experiences most-recent first. Use "present" for a current role's end and set is_current true. Use null for anything not stated — never guess dates.
For EACH education entry also return a normalized "level" — exactly one of: "secondary" (Class 10 / SSC / Matriculation / O-levels), "senior_secondary" (Class 12 / HSC / Intermediate / A-levels / high-school diploma), "diploma" (polytechnic / associate), "undergraduate" (Bachelor's — B.Tech/BE/BA/BSc/BCom/BBA/MBBS/LLB), "postgraduate" (Master's / PG diploma — MTech/MSc/MA/MBA/PGDM), "doctorate" (PhD), or "professional_cert" (a professional certificate/licence). Map ANY country's qualifications onto these. And a "status": "completed" or "ongoing".`
}

export async function enrichFromPdf(pdfBase64: string, identity: UsageIdentity = {}): Promise<EnrichedProfile> {
  const { text, usage, model } = await withRetry(
    () => generateFromPdf(buildCandidateEnrichmentPrompt(), pdfBase64, { model: 'gemini-2.5-flash', maxTokens: 4096, json: true }),
    { label: 'Candidate Enrichment' },
  )
  trackUsage('candidate-enrichment', model, usage, identity)
  const raw = parseAiJson(text, enrichmentSchema, 'Candidate Enrichment')
  return toEnrichedProfile(raw)
}
