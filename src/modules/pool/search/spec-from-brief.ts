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
import { experienceBandFromGate, yearsFloorFromLabel } from '@/lib/icp-gates'
import { schoolTiersFor } from '@/modules/pool/search/school-tiers'
import { normalizeCity } from '@/modules/pool/domain/normalize'

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

  // ── Must-have line ────────────────────────────────────────────────────────────
  const loc = marketLocation(ctx)
  if (loc) base.push({ id: cid('loc'), kind: 'location', values: [loc], radius_km: ctx.locationRadiusKm ?? DEFAULT_RADIUS_KM })

  let min: number | null = brief?.experience_band?.min_years ?? null
  let max: number | null = brief?.experience_band?.max_years ?? null
  for (const g of icp.must_haves ?? []) {
    const band = experienceBandFromGate(g)
    if (band) { min = min ?? band.min; max = max ?? band.max; continue }
    const floor = yearsFloorFromLabel(g.label ?? '')
    if (floor != null && min == null) min = floor
  }
  if (min != null || max != null) base.push({ id: cid('years'), kind: 'years_band', values: [], min, max })
  if (max != null && max <= IC_SENIORITY_CEILING_YEARS) {
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

/** The spec to acquire with: the recruiter-edited one stored on the ICP, else derived from the brief. */
export function resolveSearchSpec(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'competencies'>>,
  ctx: SpecContext = {},
): { spec: SearchSpec; stored: boolean } {
  const stored = icp.sourcing_map?.search_spec
  if (stored && stored.levels?.length) return { spec: stored, stored: true }
  return { spec: specFromIcp(icp, ctx), stored: false }
}

/** Employer terms the plan searches on (current/former/any), for profile tags like "Ex-McKinsey". */
export function feederEmployersFromSpec(spec: SearchSpec): string[] {
  const out = new Set<string>()
  for (const lvl of spec.levels) for (const c of lvl.criteria) if (c.kind.startsWith('employer_') && !c.exclude) for (const v of c.values) out.add(v)
  return Array.from(out)
}

/** The plan's Everyone line in the shape the ranking uses to judge pool recall. PURE. */
export function planEveryone(spec: SearchSpec): { city: string | null; locationText: string | null; minYears: number | null; maxYears: number | null } {
  const loc = spec.base.find((c) => c.kind === 'location' && !c.exclude)
  const yrs = spec.base.find((c) => c.kind === 'years_band')
  return { city: normalizeCity(loc?.values[0] ?? null), locationText: loc?.values[0] ?? null, minYears: yrs?.min ?? null, maxYears: yrs?.max ?? null }
}
