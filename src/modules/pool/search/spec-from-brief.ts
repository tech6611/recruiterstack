/**
 * Derive the first SEARCH SPEC from an ICP's recruiter brief. PURE + tested.
 *
 * This is the recruiter's ladder written as data: the must-have line first (market
 * radius, years band, a seniority ceiling implied by the band), then levels in the
 * order a specialist recruiter would exhaust them —
 *   tier-1 school × currently at the top feeder pool  (the 100% match)
 *   tier-1 × formerly at it · tier-1 × the next pools · tier-2 × the same · titles only.
 * Each level names what it gives up. Everything the ICP wants that no source can
 * search (SQL on the CV, structured thinking, tenure at a feeder firm) is listed as a
 * post-fetch check so the user sees it rather than wondering where it went.
 *
 * The recruiter then edits chips; edited specs win over regeneration until reset.
 */
import type { Icp, RecruiterBrief } from '@/lib/types/icp'
import type { SearchCriterion, SearchLevel, SearchSpec, PostFetchCheck } from '@/lib/types/search-spec'
import type { JobRoleContext } from '@/modules/ats/domain/job-role-context'
import { experienceBandFromGate, yearsFloorFromLabel, isCriterion, toCriterion } from '@/lib/icp-gates'
import { titleTerms } from '@/lib/ai/gate-evaluator'
import { schoolTiersFor } from '@/modules/pool/search/school-tiers'
import { normalizeCity, resolveLocationParts } from '@/modules/pool/domain/normalize'
import type { PlanEveryone } from '@/modules/pool/domain/pool-sourcing'

export interface SpecContext {
  title?: string | null
  roleContext?: JobRoleContext | null
  locationRadiusKm?: number
  /** Cap on feeder pools turned into levels. Default 4. */
  maxPools?: number
}

const DEFAULT_RADIUS_KM = 50
const DEFAULT_MAX_POOLS = 4
/** Above this band ceiling we stop assuming an IC seat and don't exclude senior titles. */
const IC_SENIORITY_CEILING_YEARS = 8
const SENIOR_TITLES = ['Director', 'Vice President', 'CXO', 'Owner / Partner']

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', AE: 'United Arab Emirates', SG: 'Singapore',
  DE: 'Germany', FR: 'France', CA: 'Canada', AU: 'Australia', NL: 'Netherlands', IE: 'Ireland', SA: 'Saudi Arabia',
}

/**
 * Split a recruiter-written employer entry into literal search terms.
 * "Boston Consulting Group (BCG)" → ["Boston Consulting Group", "BCG"] (short parenthetical = alias)
 * "Google (Strategy/BizOps teams)" → ["Google"] (long/descriptive parenthetical = dropped)
 * "McKinsey & Company" → ["McKinsey"]; "Razorpay, CRED" → ["Razorpay", "CRED"].
 */
export function employerTerms(entry: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    const term = t
      .replace(/(?:\s*&\s*|\s+and\s+)(?:company|co)\b\.?/gi, '')
      .replace(/\b(?:inc|ltd|llp|llc|pvt|corp|plc)\b\.?/gi, '')
      .replace(/\b(?:private\s+limited|limited|corporation|incorporated)\b/gi, '')
      .replace(/[.,;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (term.length < 2) return
    const k = term.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(term) }
  }
  for (const piece of entry.split(/\s*(?:,|;|\bor\b)\s*/i)) {
    if (!piece.trim()) continue
    const paren = piece.match(/\(([^)]+)\)/)?.[1]?.trim()
    push(piece.replace(/\([^)]*\)/g, ''))
    // An alias is short and has no slash/descriptive words; "Strategy/BizOps teams" is not one.
    if (paren && paren.split(/\s+/).length <= 3 && !/[\/]|teams?|division|office|group$/i.test(paren)) push(paren)
  }
  return out
}

function roleTerms(entry: string): string[] {
  return entry.split(/\s*(?:,|\/|;|\bor\b)\s*/i).map((t) => t.trim()).filter((t) => t.length >= 2)
}

type PoolKind = 'consulting' | 'finance' | 'operator'
function poolKind(pool: { label: string; companies: string[] }): PoolKind {
  const text = `${pool.label} ${pool.companies.join(' ')}`.toLowerCase()
  if (/consult|mckinsey|bain|bcg|boston consulting|kearney|oliver wyman|strategy&|accenture strategy|deloitte/.test(text)) return 'consulting'
  if (/bank|capital|ventures|partners|goldman|morgan|sequoia|accel|lightspeed|private equity|\bvc\b|\bib\b|\bpe\b/.test(text)) return 'finance'
  return 'operator'
}

let seq = 0
const cid = (kind: string) => `c-${kind}-${++seq}`

function marketLocation(ctx: SpecContext): string | null {
  const m = ctx.roleContext?.market
  if (!m || m.work_model === 'remote') return null
  const country = m.country ? (COUNTRY_NAMES[m.country.toUpperCase()] ?? m.country) : null
  const parts = [m.city, m.state, country].filter(Boolean)
  return parts.length ? parts.join(', ') : m.site ?? null
}

export function specFromIcp(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'competencies'>>,
  ctx: SpecContext = {},
): SearchSpec {
  seq = 0
  const brief: RecruiterBrief | null | undefined = icp.sourcing_map?.recruiter_brief
  const base: SearchCriterion[] = []
  const post_fetch: PostFetchCheck[] = []

  // ── The ideal profile → a ladder of relaxations (docs/ideal-profile-plan.md) ──
  const ladder = ladderFromIdealProfile(icp, ctx)
  if (ladder) return ladder

  // ── Must-have line ────────────────────────────────────────────────────────────
  // A must-have IS a search criterion (docs/structured-must-haves-plan.md): every
  // structured must-have goes on the base line verbatim. The brief's band and the
  // job's market only fill a kind the must-haves don't carry.
  const structured = (icp.must_haves ?? []).map(toCriterion).filter((c): c is SearchCriterion => c != null)
  base.push(...structured)
  const hasKind = (k: SearchCriterion['kind']) => structured.some((c) => c.kind === k)

  const loc = marketLocation(ctx)
  if (loc && !hasKind('location')) base.push({ id: cid('loc'), kind: 'location', values: [loc], radius_km: ctx.locationRadiusKm ?? DEFAULT_RADIUS_KM })

  const bandGate = structured.find((c) => c.kind === 'years_band')
  let min: number | null = bandGate?.min ?? brief?.experience_band?.min_years ?? null
  let max: number | null = bandGate?.max ?? brief?.experience_band?.max_years ?? null
  for (const g of icp.must_haves ?? []) {
    if (isCriterion(g)) continue
    const band = experienceBandFromGate(g)
    if (band) { min = min ?? band.min; max = max ?? band.max; continue }
    const floor = yearsFloorFromLabel(g.label ?? '')
    if (floor != null && min == null) min = floor
  }
  if (!bandGate && (min != null || max != null)) base.push({ id: cid('years'), kind: 'years_band', values: [], min, max })
  if (max != null && max <= IC_SENIORITY_CEILING_YEARS && !hasKind('seniority')) {
    base.push({ id: cid('sen'), kind: 'seniority', values: SENIOR_TITLES, exclude: true, label: 'Not an executive title' })
  }

  // ── School tiers: brief's lists win, then house lists for the market ─────────
  // The brief's lists win as a pair (an empty tier-2 means "no tier-2"); house lists only when the brief gave none.
  const house = schoolTiersFor(ctx.roleContext?.market?.country)
  const briefHasLists = Boolean(brief?.target_schools && (brief.target_schools.tier1?.length || brief.target_schools.tier2?.length))
  const tier1 = (briefHasLists ? brief!.target_schools!.tier1 ?? [] : house?.tier1 ?? []).map((s) => s.trim()).filter(Boolean)
  const tier2 = (briefHasLists ? brief!.target_schools!.tier2 ?? [] : house?.tier2 ?? []).map((s) => s.trim()).filter(Boolean)
  const pedigreeMatters = /tier|top (?:university|institute|college)|pedigree|iit|iim|oxbridge|ivy/i.test(
    [...(icp.must_haves ?? []).map((g) => g.label), ...(brief?.market_gates ?? []).map((g) => g.requirement)].join(' '),
  )
  const useTiers = pedigreeMatters && tier1.length > 0
  const school = (list: string[]) => ({ id: cid('school'), kind: 'school' as const, values: list })

  // ── Levels from feeder pools ──────────────────────────────────────────────────
  const pools = [...(brief?.feeder_pools ?? [])]
    .filter((p) => p.companies?.length)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .slice(0, ctx.maxPools ?? DEFAULT_MAX_POOLS)
    .map((p) => ({ ...p, terms: Array.from(new Set(p.companies.flatMap(employerTerms))), roles: Array.from(new Set((p.role_types ?? []).flatMap(roleTerms))), kind: poolKind(p) }))
    .filter((p) => p.terms.length)

  const levels: SearchLevel[] = []
  let n = 0
  const level = (label: string, criteria: SearchCriterion[], relaxes: string | null, rationale?: string | null) => {
    levels.push({ id: `L${++n}`, label, criteria, relaxes, rationale: rationale ?? null })
  }
  const poolLevels = (tierLabel: string | null, schoolList: string[] | null, relaxNote: string | null) => {
    let first = true
    for (const p of pools) {
      const withSchool = (crit: SearchCriterion[]) => (schoolList ? [school(schoolList), ...crit] : crit)
      const roles: SearchCriterion[] = p.roles.length && p.roles.length <= 10 ? [{ id: cid('title'), kind: p.kind === 'operator' ? 'title_current' : 'title_any', values: p.roles }] : []
      const prefix = tierLabel ? `${tierLabel} · ` : ''
      const relax = first ? relaxNote : null
      if (p.kind === 'consulting') {
        // "Currently in consulting" means the consulting function — a software engineer at
        // McKinsey matches the employer, not the archetype.
        const consultingFn: SearchCriterion = { id: cid('fn'), kind: 'function', values: ['Consulting'] }
        level(`${prefix}currently in ${p.label}`, withSchool([{ id: cid('emp'), kind: 'employer_current', values: p.terms }, consultingFn, ...roles]), relax, p.rationale)
        level(`${prefix}formerly in ${p.label}`, withSchool([{ id: cid('emp'), kind: 'employer_past', values: p.terms }, ...roles]), 'still there → left (recency ranked after fetch)', p.rationale)
      } else if (p.kind === 'finance') {
        level(`${prefix}${p.label}`, withSchool([{ id: cid('emp'), kind: 'employer_any', values: p.terms }, ...roles]), relax, p.rationale)
      } else {
        level(`${prefix}currently in ${p.label}`, withSchool([{ id: cid('emp'), kind: 'employer_current', values: p.terms }, ...roles]), relax, p.rationale)
      }
      first = false
    }
  }

  if (useTiers) {
    poolLevels('Tier-1 school', tier1, null)
    if (tier2.length) poolLevels('Tier-2 school', tier2, 'tier-1 schools → tier-2 schools')
  } else {
    poolLevels(null, null, null)
  }

  // Catch-all: the same search under other titles, no school or employer constraint.
  const titles = Array.from(new Set([ctx.title?.trim(), ...(brief?.title_families ?? [])].filter((t): t is string => !!t && t.length >= 2)))
  if (titles.length) {
    level('Any school · title families', [{ id: cid('title'), kind: 'title_current', values: titles }], useTiers || pools.length ? 'no school or employer constraint — title only' : null)
  }

  // ── What no source can search ─────────────────────────────────────────────────
  for (const g of icp.must_haves ?? []) {
    if (isCriterion(g)) continue                       // sent as a filter, checked from data
    if (g.attribute === 'screening') { post_fetch.push({ label: g.label ?? '', how: 'screen' }); continue }
    if (experienceBandFromGate(g)) continue
    const l = g.label ?? ''
    if (/tier|university|institute|college|degree/i.test(l) && useTiers) continue // sent as school lists
    if (/background|consult|bizops|strategy/i.test(l) && pools.length) continue   // sent as employer lists
    if (/sql|python|\br\b|excel|tool|skill|mention/i.test(l)) {
      post_fetch.push({ label: l, how: 'judge', note: 'Not searchable on most profiles. Engineering graduates from tier-1 schools are ordered first as the proxy; the AI Screen settles it.' })
      continue
    }
    post_fetch.push({ label: l, how: 'judge' })
  }
  if (pools.some((p) => p.kind === 'consulting')) {
    post_fetch.push({ label: 'Meaningful time in consulting (≥ 18 months), and how recently they left', how: 'local', note: 'Sources cannot filter on when a past role ended; computed from the stored role history and used to rank within a level.' })
  }
  for (const c of icp.competencies ?? []) post_fetch.push({ label: c.name, how: 'judge' })

  return { version: 1, base, levels, post_fetch, source: 'brief' }
}

/**
 * When the ICP's must-haves are an ideal profile — where · years · education · roles held
 * · companies, with `relax_at` on the relaxable rows — the plan is that list as L1 and a
 * RECRUITER-ORDERED ladder below it (docs/recruiter-brain-sourcing.md): exhaust company
 * breadth at the SAME title across the brief's reasoned feeder-pool tiers (competitors →
 * same-space → adjacent), THEN feeder titles across that same broadened company set, THEN
 * (for non-remote roles) a wider location. Years/education/function never relax and sit on
 * the base line ANDed into every level. Returns null for an ICP without an ideal profile. PURE.
 */
export function ladderFromIdealProfile(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'competencies'>>,
  ctx: SpecContext = {},
): SearchSpec | null {
  const all = (icp.must_haves ?? []).map(toCriterion).filter((c): c is SearchCriterion => c != null)
  const relaxable = all.filter((c) => c.relax_at != null)
  if (!relaxable.length) return null
  const brief = icp.sourcing_map?.recruiter_brief
  const base = all.filter((c) => c.relax_at == null)
  const post_fetch: PostFetchCheck[] = []

  const companies = relaxable.find((c) => c.kind.startsWith('employer_'))
  const titles = relaxable.find((c) => c.kind.startsWith('title_'))
  const location = relaxable.find((c) => c.kind === 'location')
  const others = relaxable.filter((c) => c !== companies && c !== titles && c !== location)

  const levels: SearchLevel[] = []
  const level = (label: string, criteria: SearchCriterion[], relaxes: string | null) => {
    if (criteria.length) levels.push({ id: `L${levels.length + 1}`, label, criteria, relaxes, rationale: null })
  }
  const keep = (...cs: (SearchCriterion | undefined)[]) => [...others, ...cs.filter((c): c is SearchCriterion => Boolean(c))]

  // ── #2 reasoned ladder (docs/recruiter-brain-sourcing.md): exhaust company breadth at
  // the SAME title across the brief's reasoned tiers (competitors → same-space → adjacent)
  // BEFORE widening titles, then apply feeder titles across that SAME broadened company
  // set. Companies/titles are sourcing lanes (enforcement: sourcing_only), so this orders
  // the search and ranking only, never eligibility. ──
  const poolSorted = [...(brief?.feeder_pools ?? [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  const REL_LABEL: Record<string, string> = { direct_competitor: 'Competitors', similar_problem: 'Same-space peers', adjacent_talent_market: 'Adjacent / big-tech' }
  let laneSeq = 0
  const companyLane = (vals: string[]): SearchCriterion => ({ ...(companies as SearchCriterion), id: `${companies!.id}-t${++laneSeq}`, values: vals, label: null })

  // L1: the exact persona — each ideal company its own lane (distinct recruiter bets).
  // Keep the ideal-profile ids so a person bought at L1 is vendor-verified on the must-haves.
  const idealTerms = companies?.values ?? []
  if (idealTerms.length) {
    for (const c of idealTerms) level(`Ideal profile · ${c}`, keep(location, titles, { ...(companies as SearchCriterion), values: [c], label: null }), null)
  } else {
    level('Ideal profile', keep(location, titles, companies), null)
  }

  // Company tiers: one level PER subsequent feeder pool, in priority order, SAME title.
  const seen = new Set(idealTerms.map((t) => t.toLowerCase()))
  if (companies) {
    for (const p of poolSorted.slice(1)) {
      const terms = Array.from(new Set((p.companies ?? []).flatMap(employerTerms))).filter((t) => !seen.has(t.toLowerCase()))
      if (!terms.length) continue
      terms.forEach((t) => seen.add(t.toLowerCase()))
      const rel = p.relationship ? REL_LABEL[p.relationship] : null
      level(rel ? `${rel}: ${p.label}` : p.label, keep(location, titles, companyLane(terms)), p.rationale ?? (p.relationship?.replace(/_/g, ' ') ?? null))
    }
    // The brief named no peers — still widen companies (same title) before touching titles.
    if (poolSorted.length <= 1) level('Any company · same title', keep(location, titles), 'no company constraint — same title')
  }

  // Title progression: feeder titles across the SAME broadened companies, then any company.
  const adjacent = Array.from(new Set((brief?.adjacent_titles ?? []).flatMap(titleTerms))).filter((t) => !(titles?.values ?? []).includes(t))
  if (titles && adjacent.length) {
    const adjTitles: SearchCriterion = { ...titles, id: `${titles.id}-adj`, values: adjacent, label: null }
    const allCompanies = Array.from(new Set(poolSorted.flatMap((p) => (p.companies ?? []).flatMap(employerTerms))))
    if (companies && allCompanies.length) {
      level('Feeder titles · target companies', keep(location, companyLane(allCompanies), adjTitles), `career-progression titles at the same companies: ${adjacent.slice(0, 4).join(' / ')}${adjacent.length > 4 ? ' …' : ''}`)
    }
    level('Feeder titles · any company', keep(location, { ...adjTitles, id: `${titles.id}-adj-any` }), 'feeder titles, no company constraint')
  }

  // Location widens LAST (absent entirely for remote roles).
  if (location) {
    const everyTitle = titles ? { ...titles, id: `${titles.id}-loc`, values: Array.from(new Set([...titles.values, ...adjacent])), label: null } : undefined
    const radius = (location.radius_km ?? DEFAULT_RADIUS_KM) * 3
    level('Wider location', keep({ ...location, id: `${location.id}-loc`, radius_km: radius, label: null }, everyTitle), `within ${radius} km`)
  }

  // Seniority ceiling as before: an IC band means no executive titles.
  const band = base.find((c) => c.kind === 'years_band')
  if (band?.max != null && band.max <= IC_SENIORITY_CEILING_YEARS && !all.some((c) => c.kind === 'seniority')) {
    base.push({ id: cid('sen'), kind: 'seniority', values: SENIOR_TITLES, exclude: true, label: 'Not an executive title' })
  }
  for (const g of icp.must_haves ?? []) if (g.attribute === 'screening') post_fetch.push({ label: g.label ?? '', how: 'screen' })
  for (const c of icp.competencies ?? []) post_fetch.push({ label: c.name, how: 'judge' })
  void ctx
  return { version: 1, base, levels, post_fetch, source: 'brief' }
}

/** The spec to acquire with: the recruiter-edited one stored on the ICP, else derived from the brief. */
export function resolveSearchSpec(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'competencies'>>,
  ctx: SpecContext = {},
): { spec: SearchSpec; stored: boolean } {
  const stored = icp.sourcing_map?.search_spec
  if (stored && stored.levels?.length) {
    // One source of truth: the never-relaxed must-haves ARE the base line — a stored
    // spec keeps its levels but not a stale base. Relaxable rows (relax_at set) live on
    // L1, which the stored spec already holds. (setIcpSearchSpec writes an edited plan
    // back to the must-haves, so the two never diverge.)
    const mustHaves = (icp.must_haves ?? []).map(toCriterion).filter((c): c is SearchCriterion => c != null && c.relax_at == null)
    return { spec: mustHaves.length ? { ...stored, base: mustHaves } : stored, stored: true }
  }
  return { spec: specFromIcp(icp, ctx), stored: false }
}


/** Employer terms the plan searches on (current/former/any), for profile tags like "Ex-McKinsey". */
export function feederEmployersFromSpec(spec: SearchSpec): string[] {
  const out = new Set<string>()
  for (const lvl of spec.levels) for (const c of lvl.criteria) if (c.kind.startsWith('employer_') && !c.exclude) for (const v of c.values) out.add(v)
  return Array.from(out)
}

/** The plan's Everyone line in the shape the ranking uses to judge pool recall. PURE. */
export function planEveryone(spec: SearchSpec): PlanEveryone {
  const loc = spec.base.find((c) => c.kind === 'location' && !c.exclude)
  const yrs = spec.base.find((c) => c.kind === 'years_band')
  const parts = resolveLocationParts(loc?.values[0] ?? null)
  return {
    city: normalizeCity(loc?.values[0] ?? null),
    region: parts?.region ?? null,
    country_code: parts?.country_code ?? null,
    locationText: loc?.values[0] ?? null,
    minYears: yrs?.min ?? null,
    maxYears: yrs?.max ?? null,
  }
}
