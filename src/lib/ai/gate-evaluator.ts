/**
 * Structured must-haves — Phase 1 (docs/structured-must-haves-plan.md).
 *
 * A must-have IS a search criterion: the same object the search plan sends to a vendor
 * is the gate a candidate is checked against. This module is the one place that
 *   (1) converts legacy free-text gates into criteria where the text clearly says one,
 *   (2) evaluates criteria deterministically against what we actually store, and
 *   (3) says what a criterion means in words.
 *
 * Rules: a gate never asks an LLM; missing data is `unverified` (null), never a fail;
 * a criterion that was in the query that bought a person holds for that person by
 * construction (`verified_by: 'vendor'`). PURE — no I/O.
 */
import type { IcpMustHave, GateVerdict, RecruiterBrief } from '@/lib/types/icp'
import type { CriterionKind } from '@/lib/types/search-spec'
import { CRITERION_KIND_LABEL } from '@/lib/types/search-spec'
import { experienceBandFromGate, yearsFloorFromLabel, isCriterion, toCriterion, criterionLabel, mustHaveFromCriterion } from '@/lib/icp-gates'
import { resolveLocationParts, slugifyPlace } from '@/modules/pool/domain/normalize'
import { employerTerms } from '@/modules/pool/search/spec-from-brief'

// ── Accessors (shared, in src/lib/icp-gates.ts) ─────────────────────────────────
export { isCriterion, toCriterion, criterionLabel, mustHaveFromCriterion }

// ── Title terms: whole phrases only ──────────────────────────────────────────────

/** Words that describe a level, not a job. Alone they match anything ("Senior" → Senior Account Executive). */
const GENERIC_TITLE_TOKENS = new Set([
  'senior', 'sr', 'staff', 'lead', 'head', 'manager', 'principal', 'director', 'junior', 'jr', 'associate',
  'chief', 'vp', 'vice president', 'executive', 'intern', 'consultant', 'specialist', 'analyst', 'officer', 'partner',
])

/** True when a title term would match by level alone. Such terms are never sent to a vendor. */
export function isGenericTitleTerm(term: string): boolean {
  return GENERIC_TITLE_TOKENS.has(term.trim().toLowerCase().replace(/[.]/g, ''))
}

/**
 * Split a recruiter-written title family into whole-phrase terms, and repair the
 * "Senior / Staff Software Engineer" pattern: a bare level word before a slash inherits
 * the noun of the next term ("Senior" + "Staff Software Engineer" → "Senior Software Engineer").
 */
export function titleTerms(entry: string): string[] {
  const raw = entry.split(/\s*(?:,|\/|;|\bor\b)\s*/i).map((t) => t.replace(/\(.*?\)/g, '').trim()).filter((t) => t.length >= 2)
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]
    if (!isGenericTitleTerm(t)) { out.push(t); continue }
    // "Senior" followed by "Staff Software Engineer": borrow the noun phrase after its own level word.
    const next = raw[i + 1]
    if (next) {
      const words = next.split(/\s+/)
      const noun = isGenericTitleTerm(words[0]) ? words.slice(1).join(' ') : next
      if (noun && !isGenericTitleTerm(noun)) out.push(`${t} ${noun}`)
    }
  }
  return Array.from(new Set(out.map((t) => t.replace(/\s+/g, ' '))))
}

// ── Legacy → structured conversion ───────────────────────────────────────────────

export interface ConversionContext {
  /** The job's market, for a location gate: city / state / country code. */
  market?: { city?: string | null; state?: string | null; country?: string | null; work_model?: string | null } | null
  /** The brief's title families — what "primary experience in X" becomes. */
  titleFamilies?: string[] | null
  /** Default radius for a converted location gate. */
  radiusKm?: number | null
}

/** Words in a free-text gate that name a vendor function category. */
const FUNCTION_WORDS: [RegExp, string][] = [
  [/\b(software|engineering|engineer|developer|backend|frontend|full[- ]stack|tech(?:nical)? lead)\b/i, 'Engineering'],
  [/\bsales\b|\baccount executive\b|\bbusiness development\b/i, 'Sales'],
  [/\bproduct management\b|\bproduct manager\b/i, 'Product Management'],
  [/\bmarketing\b/i, 'Marketing'],
  [/\bfinance\b|\baccounting\b/i, 'Finance'],
  [/\bconsulting\b|\bconsultant\b/i, 'Consulting'],
  [/\boperations\b|\bbizops\b/i, 'Operations'],
  [/\bhuman resources\b|\brecruit/i, 'Human Resources'],
  [/\bdata science\b|\banalytics\b/i, 'Data Science'],
  [/\bdesign\b/i, 'Design'],
]

const SCHOOL_TOKENS = /\b(IIM[A-Z]?|IIT[A-Z]?|ISB|BITS(?: Pilani)?|NIT[A-Z]?|XLRI|FMS|SRCC|Stanford|MIT|Harvard|Wharton|INSEAD|Oxford|Cambridge)\b/g

/** A legacy gate the profile can never answer — kept on the ICP as "ask the candidate", never evaluated. */
export const SCREENING_ATTRIBUTE = 'screening'

/**
 * Convert legacy free-text gates into criteria where the text clearly says one; gates
 * that name nothing a profile or vendor holds become `screening` gates. Already
 * structured gates pass through untouched. Ids AND labels are kept verbatim — the
 * sourcing matrix and stored snapshots match gate cells by label — so a converted
 * gate reads as before while gating from data. PURE.
 */
export function convertLegacyGates(gates: IcpMustHave[] | null | undefined, ctx: ConversionContext = {}): IcpMustHave[] {
  const out: IcpMustHave[] = []
  const has = (kind: CriterionKind) => out.some((g) => g.kind === kind)
  for (const g of gates ?? []) {
    if (isCriterion(g)) { out.push(g); continue }
    if (g.attribute === SCREENING_ATTRIBUTE) { out.push(g); continue }
    const label = g.label ?? ''
    const attr = (g.attribute ?? '').toLowerCase()

    // Years: structured band, "5+ years", "between 6 and 12 years".
    const band = experienceBandFromGate(g)
    const between = label.match(/(\d+(?:\.\d+)?)\s*(?:–|-|to|and)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs)/i)
    const floor = attr === 'min_experience' ? Number(String(Array.isArray(g.value) ? g.value[0] : g.value).match(/\d+(\.\d+)?/)?.[0]) || null : yearsFloorFromLabel(label)
    const yrs = band ?? (between ? { min: Number(between[1]), max: Number(between[2]) } : floor != null ? { min: floor, max: null } : null)
    if (yrs && (yrs.min != null || yrs.max != null)) {
      if (!has('years_band')) out.push(mustHaveFromCriterion({ id: g.id, kind: 'years_band', values: [], min: yrs.min, max: yrs.max }, label))
      continue
    }

    // Location: an explicit location attribute, or "based in <the market>".
    const m = ctx.market
    const marketText = m && m.work_model !== 'remote' ? [m.city, m.state, m.country].filter(Boolean).join(', ') : ''
    const mentionsMarket = Boolean(m?.city && slugifyPlace(label).includes(slugifyPlace(m.city)))
    if (attr === 'location' || (/\b(based in|located in|relocat|onsite|on-site)\b/i.test(label) && mentionsMarket)) {
      const place = attr === 'location' && typeof g.value === 'string' && g.value.trim() ? g.value.trim() : marketText
      if (place && !has('location')) out.push(mustHaveFromCriterion({ id: g.id, kind: 'location', values: [place], radius_km: ctx.radiusKm ?? 50 }, label))
      else if (!place) out.push({ ...g, attribute: SCREENING_ATTRIBUTE })
      continue
    }

    // Skill: an explicit skill attribute.
    if (attr === 'skill' || attr === 'skills') {
      const vals = (Array.isArray(g.value) ? g.value : [String(g.value)]).map((v) => String(v).trim()).filter(Boolean)
      if (vals.length) { out.push(mustHaveFromCriterion({ id: g.id, kind: 'skill', values: vals }, label)); continue }
    }

    // School: an explicit attribute, or well-known school tokens in the label.
    const schools = attr === 'school' || attr === 'education'
      ? (Array.isArray(g.value) ? g.value : [String(g.value)]).map((v) => String(v).trim()).filter(Boolean)
      : Array.from(new Set(label.match(SCHOOL_TOKENS) ?? []))
    if (schools.length) { out.push(mustHaveFromCriterion({ id: g.id, kind: 'school', values: schools }, label)); continue }

    // "Primary experience in X" / "background in X": titles from the brief + the function the label names.
    if (/\b(primary experience|background|experience) (?:in|as)\b|\bgenuine .* background\b/i.test(label)) {
      const fn = FUNCTION_WORDS.find(([re]) => re.test(label))?.[1] ?? null
      const titles = (ctx.titleFamilies ?? []).flatMap(titleTerms)
      // Titles carry the meaning and are checkable from stored roles; a function gate is
      // only the fallback when the brief has no title families (function isn't stored per
      // role yet, so on pool people it can only ever read "unverified").
      if (titles.length && !has('title_any')) { out.push(mustHaveFromCriterion({ id: g.id, kind: 'title_any', values: titles }, label)); continue }
      if (fn && !has('function')) { out.push(mustHaveFromCriterion({ id: g.id, kind: 'function', values: [fn] }, label)); continue }
    }

    // Nothing a profile or vendor holds (work authorization, willingness, passion…): ask the candidate.
    out.push({ ...g, attribute: SCREENING_ATTRIBUTE })
  }
  return out
}

// ── Evaluation ───────────────────────────────────────────────────────────────────

export interface EvaluableCandidate {
  experience_years?: number | null
  location?: string | null
  current_title?: string | null
  current_company?: string | null
  skills?: string[] | null
}
export interface EvaluableHistory {
  experiences?: { title?: string | null; employer?: string | null; is_current?: boolean | null }[]
  education?: { school?: string | null; year?: string | number | null; degree?: string | null; field?: string | null }[]
}
export interface EvaluationContext {
  /** Criterion ids that were in the vendor query that bought this person. */
  vendorFilteredGateIds?: Set<string> | null
  /** Years slack applied to a band on both sides (recall uses the same). */
  yearsSlack?: number
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
/** Whole-phrase, case-insensitive containment: "engineering manager" in "Senior Engineering Manager, Platform". */
const phraseIn = (hay: string, needle: string) => {
  const h = ` ${norm(hay).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `
  const n = ` ${norm(needle).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `
  return n.trim().length > 0 && h.includes(n)
}

/**
 * Check every structured must-have against the data on file. Legacy gates are ignored
 * here (the caller sends them to the judge). PURE.
 */
export function evaluateMustHaves(
  gates: IcpMustHave[],
  candidate: EvaluableCandidate,
  history: EvaluableHistory | null | undefined,
  ctx: EvaluationContext = {},
): GateVerdict[] {
  const slack = ctx.yearsSlack ?? 1
  const exps = history?.experiences ?? []
  const edu = history?.education ?? []
  const current = exps.filter((e) => e.is_current)
  const titles = { current: (current.length ? current : exps.slice(0, 1)).map((e) => e.title ?? '').concat(candidate.current_title ?? ''), any: exps.map((e) => e.title ?? '').concat(candidate.current_title ?? '') }
  const employers = {
    current: (current.length ? current : exps.slice(0, 1)).map((e) => e.employer ?? '').concat(candidate.current_company ?? ''),
    past: exps.filter((e) => !e.is_current).map((e) => e.employer ?? ''),
    any: exps.map((e) => e.employer ?? '').concat(candidate.current_company ?? ''),
  }
  const clean = (xs: string[]) => xs.map(norm).filter(Boolean)

  const verdicts: GateVerdict[] = []
  for (const g of gates) {
    const c = toCriterion(g)
    if (!c) continue
    const label = g.label || criterionLabel(c)
    const done = (pass: boolean | null, reason: string, verified_by: GateVerdict['verified_by'] = pass == null ? null : 'data') =>
      verdicts.push({ id: g.id, kind: c.kind, label, pass, verified_by, reason })
    if (ctx.vendorFilteredGateIds?.has(g.id)) { done(true, 'In the search that found this person', 'vendor'); continue }

    // Include → any value matches; exclude → none may match; nothing on file → unverified.
    const anyOf = (hay: string[], needles: string[], noun: string, match = phraseIn) => {
      const h = clean(hay)
      if (!h.length) return done(null, `No ${noun} on file`)
      const hit = needles.find((n) => h.some((x) => match(x, n)))
      if (c.exclude) return hit ? done(false, `${noun}: ${hit}`) : done(true, `None of: ${needles.slice(0, 4).join(' / ')}`)
      return hit ? done(true, `${noun}: ${hit}`) : done(false, `No ${noun} matches ${needles.slice(0, 4).join(' / ')}${needles.length > 4 ? '…' : ''}`)
    }

    switch (c.kind) {
      case 'years_band': {
        const y = candidate.experience_years
        if (y == null || !Number.isFinite(y)) { done(null, 'Years of experience unknown'); break }
        const lo = c.min != null ? c.min - slack : null
        const hi = c.max != null ? c.max + slack : null
        const ok = (lo == null || y >= lo) && (hi == null || y <= hi)
        done(ok, `${y} yrs, band ${c.min ?? '0'}–${c.max ?? '∞'}`)
        break
      }
      case 'title_current': anyOf(titles.current, c.values, 'current title'); break
      case 'title_any': anyOf(titles.any, c.values, 'title'); break
      case 'employer_current': anyOf(employers.current, c.values.flatMap(employerTerms), 'current employer'); break
      case 'employer_past': anyOf(employers.past, c.values.flatMap(employerTerms), 'past employer'); break
      case 'employer_any': anyOf(employers.any, c.values.flatMap(employerTerms), 'employer'); break
      case 'school': anyOf(edu.map((e) => e.school ?? ''), c.values, 'school'); break
      case 'degree_field': anyOf(edu.map((e) => [e.degree, e.field].filter(Boolean).join(' ')), c.values, 'degree / field'); break
      case 'skill': anyOf(candidate.skills ?? [], c.values, 'skill', (x, n) => x === norm(n) || phraseIn(x, n)); break
      case 'grad_year_band': {
        const years = edu.map((e) => Number(e.year)).filter((y) => Number.isFinite(y) && y > 1950)
        if (!years.length) { done(null, 'No graduation year on file'); break }
        const y = Math.max(...years)
        const ok = (c.min == null || y >= c.min) && (c.max == null || y <= c.max)
        done(ok, `Graduated ${y}, band ${c.min ?? '…'}–${c.max ?? '…'}`)
        break
      }
      case 'location': {
        const want = resolveLocationParts(c.values[0])
        const have = resolveLocationParts(candidate.location)
        if (!want) { done(null, 'Plan location not recognised'); break }
        if (!have) { done(null, 'Location unknown'); break }
        // City when known → region when known → country when known; a genuinely unknown level passes.
        let same: boolean | null = null
        if (want.city && have.city) same = want.city === have.city
        else if (want.region && have.region) same = want.region === have.region
        else if (want.country_code && have.country_code) same = want.country_code === have.country_code
        if (same == null) { done(null, `Location "${candidate.location}" too vague to compare`); break }
        const where = have.city ?? have.region ?? have.country ?? candidate.location
        done(c.exclude ? !same : same, same ? `${where}` : `${where}, not ${want.city ?? want.region ?? want.country}`)
        break
      }
      case 'seniority':
      case 'function':
      case 'industry':
      case 'company_size':
      case 'company_type':
      case 'funding_stage':
        // Not stored per role yet — only a vendor filter can verify these.
        done(null, `${CRITERION_KIND_LABEL[c.kind]} not on file`)
        break
    }
  }
  return verdicts
}

// ── The ideal profile (docs/ideal-profile-plan.md) ───────────────────────────────

/** Stable ids so a regenerated profile keeps matching stored snapshots and run records. */
export const IDEAL_PROFILE_IDS = {
  location: 'ip-location', years: 'ip-years', education: 'ip-education', titles: 'ip-titles', companies: 'ip-companies',
} as const

/** The ladder: the level at which each relaxable dimension is loosened. Years and education never are. */
export const RELAX_AT = { companies: 2, titles: 3, location: 4 } as const

export interface IdealProfileMarket { city?: string | null; state?: string | null; country?: string | null; work_model?: string | null }

/**
 * Who we are looking for, as filters: where · years · education · roles held ·
 * companies. Built from the recruiter brief and the job's market; this list IS L1 and
 * IS the must-have list. Rows the brief has nothing for are simply absent. PURE.
 */
export function idealProfileFromBrief(
  brief: Pick<RecruiterBrief, 'experience_band' | 'title_families' | 'feeder_pools' | 'education' | 'market'> | null | undefined,
  market: IdealProfileMarket | null | undefined,
  opts: { radiusKm?: number } = {},
): IcpMustHave[] {
  const out: IcpMustHave[] = []
  const radius = opts.radiusKm ?? 50

  // Where: the job's structured market first; the brief's free-text market as a fallback.
  const remote = market?.work_model === 'remote'
  const place = market && !remote ? [market.city, market.state, market.country].filter(Boolean).join(', ') : ''
  const fallback = !market && brief?.market ? resolveLocationParts(brief.market) : null
  const where = place || (fallback ? [fallback.city, fallback.region, fallback.country].filter(Boolean).join(', ') : '')
  if (where) out.push(mustHaveFromCriterion({ id: IDEAL_PROFILE_IDS.location, kind: 'location', values: [where], radius_km: radius, relax_at: RELAX_AT.location }))

  // Years: never relaxed.
  const band = brief?.experience_band
  if (band && (band.min_years != null || band.max_years != null)) {
    out.push(mustHaveFromCriterion({ id: IDEAL_PROFILE_IDS.years, kind: 'years_band', values: [], min: band.min_years ?? null, max: band.max_years ?? null }))
  }

  // Education: never relaxed.
  const edu = [...(brief?.education?.degrees ?? []), ...(brief?.education?.fields ?? [])].map((s) => s.trim()).filter(Boolean)
  if (edu.length) out.push(mustHaveFromCriterion({ id: IDEAL_PROFILE_IDS.education, kind: 'degree_field', values: Array.from(new Set(edu)) }))

  // Roles held: whole-phrase titles, never a bare level word.
  const titles = Array.from(new Set((brief?.title_families ?? []).flatMap(titleTerms)))
  if (titles.length) out.push(mustHaveFromCriterion({ id: IDEAL_PROFILE_IDS.titles, kind: 'title_any', values: titles, relax_at: RELAX_AT.titles }))

  // Companies: the first feeder pool (lowest priority number) is the ideal.
  const pools = [...(brief?.feeder_pools ?? [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  const companies = Array.from(new Set((pools[0]?.companies ?? []).flatMap(employerTerms)))
  if (companies.length) out.push(mustHaveFromCriterion({ id: IDEAL_PROFILE_IDS.companies, kind: 'employer_current', values: companies, relax_at: RELAX_AT.companies }))

  return out
}
