/**
 * Does one pool person fit one BET? The Scoring tab shows a real sample person per bet
 * (the card + its ideal profile), each profile line marked ✓ / ✗ / ? against them.
 * Checked from the stored data only — no AI, no credits — so it can run on every edit.
 * PURE + tested.
 */
import type { SearchCriterion } from '@/lib/types/search-spec'
import { CRITERION_KIND_LABEL } from '@/lib/types/search-spec'
import { resolveLocationParts } from '@/modules/pool/domain/normalize'

/** What the check needs from a pool_profiles row. */
export interface BetSamplePerson {
  id: string
  display_name: string | null
  headline?: string | null
  current_title: string | null
  current_company: string | null
  location_raw: string | null
  location_city: string | null
  location_region?: string | null
  location_country_code?: string | null
  experience_years: number | null
  skills?: string[] | null
  education?: { school?: string | null; degree?: string | null; field?: string | null; field_of_study?: string | null; year?: string | number | null; end_year?: string | number | null }[] | null
  reachable?: boolean | null
}

export type CheckResult = 'pass' | 'fail' | 'unknown'

export interface BetCheck {
  id: string
  kind: SearchCriterion['kind']
  label: string
  result: CheckResult
  /** What the person has, in a few words ("Associate at BCG", "4 yrs", "Mumbai"). */
  note: string | null
}

const clean = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9&+#.\s]/g, ' ').replace(/\s+/g, ' ').trim()
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `term` appears in `text` as whole words ("Bain" is in "Bain & Company", not "Bainbridge"). */
export function hasWords(text: string | null | undefined, term: string): boolean {
  const t = clean(term)
  if (!t) return false
  return new RegExp(`(^|[^a-z0-9])${esc(t)}($|[^a-z0-9])`).test(clean(text))
}

/** A title holds every word of the value, in any order ("Business Analyst" ⊂ "Senior Business Analyst, Strategy"). */
export function titleHas(title: string | null | undefined, value: string): boolean {
  const words = clean(value).split(' ').filter(Boolean)
  return words.length > 0 && words.every((w) => hasWords(title, w))
}

/**
 * Words that put a title in a FUNCTION. A bet's titles are often level words ("Analyst",
 * "Associate") that fit anyone at the firm — "Software Engineer | Associate" at Goldman
 * Sachs holds "Associate", but is not the IB bet. A title in a function the bet's own
 * titles never name is a different job, whatever level word it shares.
 */
const FUNCTION_WORDS: Record<string, string[]> = {
  // Role nouns only: "Software" or "Engineering" alone also describe what a strategy or
  // program job is ABOUT ("Program Manager, Engineering"; "Strategy, Software Business").
  engineering: ['engineer', 'developer', 'sde', 'programmer', 'devops', 'sre', 'qa', 'tester', 'full stack', 'fullstack', 'frontend', 'front end', 'backend', 'back end', 'firmware'],
  design: ['designer', 'ux', 'ui', 'graphic'],
  sales: ['sales', 'account executive', 'sdr', 'bdr', 'inside sales'],
  marketing: ['marketing', 'seo', 'brand', 'social media'],
  people: ['recruiter', 'recruiting', 'recruitment', 'talent acquisition', 'hr', 'human resources', 'people partner', 'hrbp'],
  support: ['customer support', 'customer success', 'support engineer', 'technical support', 'helpdesk', 'help desk'],
  legal: ['legal', 'counsel', 'lawyer', 'attorney', 'paralegal', 'advocate'],
  medical: ['nurse', 'doctor', 'physician', 'pharmacist', 'clinical'],
  it: ['it support', 'system administrator', 'sysadmin', 'network administrator', 'it administrator'],
  admin: ['executive assistant', 'administrative assistant', 'receptionist', 'office assistant'],
}

/** The functions a title names ("Software Engineer | Associate" → engineering). PURE. */
export function titleFunctions(title: string | null | undefined): string[] {
  // "Developer Ecosystem / Relations / Community" is a program's subject, not an engineer.
  const t = String(title ?? '').replace(/\bdeveloper\s+(ecosystem|relations|community|experience|advocacy|marketing|platform|program|success)s?\b/gi, ' ')
  return Object.entries(FUNCTION_WORDS).filter(([, words]) => words.some((w) => hasWords(t, w))).map(([f]) => f)
}

/** How well a title fits the bet's titles: 2 = a whole phrase in order, 1 = its words scattered, 0 = no. PURE. */
export function titleStrength(title: string | null | undefined, values: string[]): 0 | 1 | 2 {
  if (values.some((v) => hasWords(title, v))) return 2
  return values.some((v) => titleHas(title, v)) ? 1 : 0
}

function flip(r: CheckResult, exclude?: boolean): CheckResult {
  if (!exclude || r === 'unknown') return r
  return r === 'pass' ? 'fail' : 'pass'
}

const years = (p: BetSamplePerson) => (p.experience_years == null ? null : Math.round(Number(p.experience_years) * 10) / 10)

function checkLocation(c: SearchCriterion, p: BetSamplePerson): { result: CheckResult; note: string | null } {
  const want = resolveLocationParts(c.values[0] ?? null)
  const note = p.location_city ?? p.location_raw ?? null
  if (!want) return { result: 'unknown', note }
  const have = p.location_city
    ? { city: p.location_city, region: p.location_region ?? null, country_code: p.location_country_code ?? null }
    : resolveLocationParts(p.location_raw)
  if (!have) return { result: 'unknown', note }
  if (want.city && have.city) return { result: clean(want.city) === clean(have.city) ? 'pass' : 'fail', note }
  if (want.city && have.region && want.region) return { result: clean(have.region) === clean(want.region) ? 'unknown' : 'fail', note }
  if (want.country_code && have.country_code) return { result: have.country_code === want.country_code ? (want.city ? 'unknown' : 'pass') : 'fail', note }
  return { result: 'unknown', note }
}

function checkBand(min: number | null | undefined, max: number | null | undefined, v: number | null): CheckResult {
  if (v == null) return 'unknown'
  if (min != null && v < min) return 'fail'
  if (max != null && v > max + 0.5) return 'fail'
  return 'pass'
}

const schools = (p: BetSamplePerson) => (p.education ?? []).map((e) => e?.school ?? '').filter(Boolean)
const gradYear = (p: BetSamplePerson) => {
  const ys = (p.education ?? []).map((e) => Number(e?.end_year ?? e?.year)).filter((y) => Number.isFinite(y) && y > 1950)
  return ys.length ? Math.max(...ys) : null
}

/** One profile line against one person. */
export function checkCriterion(c: SearchCriterion, p: BetSamplePerson): BetCheck {
  const label = c.label ?? CRITERION_KIND_LABEL[c.kind]
  const base = { id: c.id, kind: c.kind, label }
  const vals = c.values.map((v) => v.trim()).filter(Boolean)
  switch (c.kind) {
    case 'employer_current':
    case 'employer_any':
    case 'employer_past': {
      // The pool row carries the current employer only; a past-employer line can't be told apart.
      const hit = vals.find((v) => hasWords(p.current_company, v))
      const result: CheckResult = hit ? 'pass' : c.kind === 'employer_current' ? 'fail' : 'unknown'
      return { ...base, result: flip(result, c.exclude), note: p.current_company }
    }
    case 'title_current':
    case 'title_any': {
      if (!p.current_title) return { ...base, result: 'unknown', note: null }
      const hit = vals.some((v) => titleHas(p.current_title, v))
      if (hit && !c.exclude) {
        // Shares a word, but works in a function none of the bet's titles name.
        const wanted = new Set(vals.flatMap(titleFunctions))
        const other = titleFunctions(p.current_title).filter((f) => !wanted.has(f))
        if (other.length) return { ...base, result: 'fail', note: `${p.current_title} — ${other[0]}, not this bet` }
      }
      return { ...base, result: flip(hit ? 'pass' : c.kind === 'title_current' ? 'fail' : 'unknown', c.exclude), note: p.current_title }
    }
    case 'location': {
      const r = checkLocation(c, p)
      return { ...base, result: flip(r.result, c.exclude), note: r.note }
    }
    case 'years_band': {
      const y = years(p)
      return { ...base, result: checkBand(c.min, c.max, y), note: y == null ? null : `${y} yrs` }
    }
    case 'grad_year_band': {
      const y = gradYear(p)
      return { ...base, result: checkBand(c.min, c.max, y), note: y == null ? null : `graduated ${y}` }
    }
    case 'school': {
      const s = schools(p)
      if (!s.length) return { ...base, result: 'unknown', note: null }
      const hit = s.find((x) => vals.some((v) => hasWords(x, v)))
      return { ...base, result: flip(hit ? 'pass' : 'fail', c.exclude), note: hit ?? s[0] }
    }
    case 'degree_field': {
      const eds = (p.education ?? []).map((e) => [e?.degree, e?.field, e?.field_of_study].filter(Boolean).join(' ')).filter(Boolean)
      if (!eds.length) return { ...base, result: 'unknown', note: null }
      const hit = eds.find((x) => vals.some((v) => hasWords(x, v)))
      return { ...base, result: flip(hit ? 'pass' : 'fail', c.exclude), note: hit ?? eds[0] }
    }
    case 'skill': {
      const sk = p.skills ?? []
      if (!sk.length) return { ...base, result: 'unknown', note: null }
      const hit = sk.find((x) => vals.some((v) => clean(x) === clean(v)))
      return { ...base, result: flip(hit ? 'pass' : 'unknown', c.exclude), note: hit ?? null }
    }
    default:
      // Seniority, function, industry, company size/type, funding: not on the pool row.
      return { ...base, result: 'unknown', note: null }
  }
}

export interface RankedSample {
  person: BetSamplePerson
  checks: BetCheck[]
  fails: number
  passes: number
}

/**
 * Every candidate checked against the bet's lines, best first: fewest ✗, then a title
 * that fits, then most ✓, then reachable. PURE.
 */
export function rankBetSamples(people: BetSamplePerson[], criteria: SearchCriterion[]): RankedSample[] {
  const titleRows = criteria.filter((c) => c.kind.startsWith('title_') && !c.exclude)
  const titleIds = new Set(titleRows.map((c) => c.id))
  const titleValues = titleRows.flatMap((c) => c.values)
  return people
    .map((person) => {
      const checks = criteria.map((c) => checkCriterion(c, person))
      const titleOk = checks.some((k) => titleIds.has(k.id) && k.result === 'pass')
      return {
        person,
        checks,
        fails: checks.filter((k) => k.result === 'fail').length,
        passes: checks.filter((k) => k.result === 'pass').length,
        // "Business Analyst" as written beats its words scattered through a longer title.
        title: titleOk ? titleStrength(person.current_title, titleValues) : 0,
      }
    })
    .sort((a, b) => a.fails - b.fails || b.title - a.title || b.passes - a.passes || Number(!!b.person.reachable) - Number(!!a.person.reachable))
    .map((r) => ({ person: r.person, checks: r.checks, fails: r.fails, passes: r.passes }))
}
