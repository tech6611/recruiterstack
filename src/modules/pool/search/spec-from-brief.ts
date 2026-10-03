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
import { experienceBandFromGate, yearsFloorFromLabel, isCriterion, toCriterion, jobWideMustHaves, isBetOverride, overrideBaseId } from '@/lib/icp-gates'
import { titleTerms } from '@/lib/ai/gate-evaluator'
import { groupEmployerAliases } from '@/lib/employer-aliases'
import { poolKind } from '@/lib/bets'
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
 * The school lists for this search. The brief's lists win as a pair (an empty tier-2
 * means "no tier-2"); the house lists for the market's country only when the brief gave
 * none. PURE.
 */
export function schoolTiers(
  brief: Pick<RecruiterBrief, 'target_schools'> | null | undefined,
  country: string | null | undefined,
): { tier1: string[]; tier2: string[] } {
  const house = schoolTiersFor(country)
  const own = brief?.target_schools
  const briefHasLists = Boolean(own && (own.tier1?.length || own.tier2?.length))
  const clean = (l: string[] | null | undefined) => (l ?? []).map((x) => x.trim()).filter(Boolean)
  return briefHasLists ? { tier1: clean(own!.tier1), tier2: clean(own!.tier2) } : { tier1: clean(house?.tier1), tier2: clean(house?.tier2) }
}

/** Whether the brief treats school pedigree as a first-pass signal ("degree from a top university"). PURE. */
export function pedigreeMatters(texts: (string | null | undefined)[]): boolean {
  return /tier|top (?:university|institute|college)|pedigree|iit|iim|oxbridge|ivy/i.test(texts.filter(Boolean).join(' '))
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

export function roleTerms(entry: string): string[] {
  return entry.split(/\s*(?:,|\/|;|\bor\b)\s*/i).map((t) => t.trim()).filter((t) => t.length >= 2)
}

export { poolKind }

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
  // Built from the shared rows; resolveSearchSpec puts each bet's own into its levels.
  icp = { ...icp, must_haves: jobWideMustHaves(icp.must_haves) }
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
  const { tier1, tier2 } = schoolTiers(brief, ctx.roleContext?.market?.country)
  const useTiers = pedigreeMatters([...(icp.must_haves ?? []).map((g) => g.label), ...(brief?.market_gates ?? []).map((g) => g.requirement)]) && tier1.length > 0
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

  return fitLabels({ version: 1, base, levels, post_fetch, source: 'brief' })
}

/**
 * When the ICP's must-haves are an ideal profile — where · years · education · roles held
 * · companies, with `relax_at` on the relaxable rows — the plan is that list as L1 and a
 * RECRUITER-ORDERED ladder below it (docs/recruiter-brain-sourcing.md): exhaust company
 * breadth at the SAME title across the brief's reasoned feeder-pool tiers (competitors →
 * same-space → adjacent), THEN the same pools' former employees (the persona who has
 * moved on), THEN tier-2 schools at the targets when pedigree matters, THEN feeder titles
 * across that same broadened company set, THEN (for non-remote roles) a wider location. Years/education/function never relax and sit on
 * the base line ANDed into every level. Returns null for an ICP without an ideal profile. PURE.
 */
export function ladderFromIdealProfile(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'competencies'>>,
  ctx: SpecContext = {},
): SearchSpec | null {
  icp = { ...icp, must_haves: jobWideMustHaves(icp.must_haves) }
  const all = (icp.must_haves ?? []).map(toCriterion).filter((c): c is SearchCriterion => c != null)
  const relaxable = all.filter((c) => c.relax_at != null)
  if (!relaxable.length) return null
  const brief = icp.sourcing_map?.recruiter_brief
  const base = all.filter((c) => c.relax_at == null)
  const post_fetch: PostFetchCheck[] = []

  // Bet rows (company group + its titles) are searched as bets, below; the single
  // companies/titles rows are the pre-bet profile shape.
  const betRows = relaxable.filter((c) => c.bet != null)
  const companies = relaxable.find((c) => c.kind.startsWith('employer_') && c.bet == null)
  const titles = relaxable.find((c) => c.kind.startsWith('title_') && c.bet == null)
  const location = relaxable.find((c) => c.kind === 'location')
  // Tier-1 schools ride on every company lane (current and former), then tier-2 gets one
  // pass at the target companies, then the school is dropped — the older planner's order.
  const school = relaxable.find((c) => c.kind === 'school')
  const others = relaxable.filter((c) => c !== companies && c !== titles && c !== location && c !== school && c.bet == null)

  const levels: SearchLevel[] = []
  const level = (label: string, criteria: SearchCriterion[], relaxes: string | null, fallback = false, ideal = false) => {
    if (criteria.length) levels.push({ id: `L${levels.length + 1}`, label, criteria, relaxes, rationale: null, fallback: fallback || undefined, ideal: ideal || undefined })
  }
  const keep = (...cs: (SearchCriterion | undefined)[]) => [...others, ...cs.filter((c): c is SearchCriterion => Boolean(c))]

  // ── #2 reasoned ladder (docs/recruiter-brain-sourcing.md): exhaust company breadth at
  // the SAME title across the brief's reasoned tiers (competitors → same-space → adjacent)
  // BEFORE widening titles, then apply feeder titles across that SAME broadened company
  // set. Companies/titles are sourcing lanes (enforcement: sourcing_only), so this orders
  // the search and ranking only, never eligibility. ──
  const poolSorted = [...(brief?.feeder_pools ?? [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  const REL_LABEL: Record<string, string> = { direct_competitor: 'Competitors', similar_problem: 'Same-space peers', adjacent_talent_market: 'Adjacent / big-tech' }
  // Lane ids are named after the tier (not numbered), so a saved plan's tier keeps
  // matching the same tier when an earlier tier empties out (refreshWideningLevel).
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'tier'
  const companyLane = (vals: string[], tier: string): SearchCriterion => ({ ...(companies as SearchCriterion), id: `${companies!.id}-t-${slug(tier)}`, values: vals, label: null })

  /**
   * The bet ladder. Each bet is a company group and the titles searched THERE, straight
   * from the profile, so what the recruiter edits on Scoring is exactly what runs:
   *   bet 1, one line per firm (the ideal) → each later bet → each bet's former employees
   *   → tier-2 schools at every bet's companies → feeder titles → a wider location.
   * The role's own titles are used only where no company is named (the last steps), or
   * for a bet whose titles row was removed.
   */
  function betLevels() {
    const roleTitleTerms = Array.from(new Set((brief?.title_families ?? []).flatMap(titleTerms)))
    const roleTitles: SearchCriterion | undefined = roleTitleTerms.length
      ? { id: 'ip-role-titles', kind: brief?.title_basis === 'past' ? 'title_any' : 'title_current', values: roleTitleTerms, label: null }
      : undefined
    const bets = Array.from(new Set(betRows.map((c) => c.bet as number))).sort((x, y) => x - y).map((n) => {
      const rows = betRows.filter((c) => c.bet === n)
      const employer = rows.find((c) => c.kind.startsWith('employer_'))
      const not = rows.find((c) => c.kind.startsWith('title_') && c.exclude)
      return {
        n,
        label: rows.find((c) => c.bet_label)?.bet_label ?? `Bet ${n}`,
        employer: employer ? { ...employer, label: null } : undefined,
        titles: (() => { const t = rows.find((c) => c.kind.startsWith('title_') && !c.exclude); return t ? { ...t, label: null } : roleTitles })(),
        // The jobs at these employers that are not this bet ("Software Engineer" at a
        // bank) — written per bet by the brief, so the right exclusions for any industry.
        not: not ? { ...not, label: null } : undefined,
      }
    })
    // A bet's exclusions apply where its people are searched at their CURRENT employer.
    const notHere = (b: (typeof bets)[number]) => (b.employer?.kind === 'employer_current' ? b.not : undefined)

    // Bet 1: one line per FIRM (a firm's names — "Boston Consulting Group", "BCG" — stay
    // together). The must-have ids are kept, so a person bought here is vendor-verified.
    const [first, ...rest] = bets
    if (first?.employer) {
      for (const g of groupEmployerAliases(first.employer.values)) {
        level(`Ideal profile · ${g.display}`, keep(location, school, first.titles, { ...first.employer, values: g.members }, notHere(first)), null, false, true)
      }
    } else if (first) {
      level('Ideal profile', keep(location, school, first.titles), null, false, true)
    }

    // Each later bet, in order, with its own titles.
    for (const b of rest) {
      if (!b.employer) continue
      level(`Bet ${b.n}: ${b.label}`, keep(location, school, b.titles, b.employer, notHere(b)), `bet ${b.n - 1} → bet ${b.n}`)
    }

    // Former employees of every bet, in the same order: the same persona who has moved on.
    for (const b of bets) {
      if (!b.employer || b.employer.kind !== 'employer_current') continue
      level(`Formerly at: ${b.label}`, keep(
        location, school,
        b.titles ? { ...b.titles, id: `${b.titles.id}-was-${b.n}`, kind: 'title_any' } : undefined,
        { ...b.employer, id: `${b.employer.id}-was`, kind: 'employer_past' },
      ), 'still there → moved on (any current company)')
    }

    // One bet only: widen to any company at its titles before touching titles.
    if (bets.length === 1 && first?.titles) level('Any company · same title', keep(location, school, first.titles), 'no company constraint — same title')

    const allCompanies = Array.from(new Set(bets.flatMap((b) => b.employer?.values ?? [])))
    const allTitles = Array.from(new Set(bets.flatMap((b) => b.titles?.values ?? [])))

    // Tier-2 schools: one pass over every bet's companies, any bet's titles.
    const country = ctx.roleContext?.market?.country ?? resolveLocationParts(location?.values[0] ?? null)?.country_code ?? null
    const tier2 = school ? schoolTiers(brief, country).tier2 : []
    if (school && tier2.length && allCompanies.length) {
      level('Tier-2 school · target companies', keep(
        location,
        { ...school, id: `${school.id}-t2`, values: tier2, label: null },
        allTitles.length ? { id: 'ip-bets-titles-any', kind: 'title_any', values: allTitles, label: null } : undefined,
        { id: 'ip-bets-companies-any', kind: 'employer_any', values: allCompanies, label: null },
      ), 'tier-1 schools → tier-2 schools')
    }

    // Feeder titles at every bet's companies, then anywhere.
    const adjacent = Array.from(new Set((brief?.adjacent_titles ?? []).flatMap(titleTerms))).filter((t) => !allTitles.includes(t) && !roleTitleTerms.includes(t))
    if (adjacent.length) {
      const adj: SearchCriterion = { id: 'ip-role-titles-adj', kind: roleTitles?.kind ?? 'title_current', values: adjacent, label: null }
      if (allCompanies.length) level('Feeder titles · target companies', keep(location, { id: 'ip-bets-companies-all', kind: 'employer_current', values: allCompanies, label: null }, adj), `career-progression titles at the same companies: ${adjacent.slice(0, 4).join(' / ')}${adjacent.length > 4 ? ' …' : ''}`)
      level('Feeder titles · any company', keep(location, { ...adj, id: 'ip-role-titles-adj-any' }), 'feeder titles, no company constraint', true)
    }

    // Location widens LAST, at the role's own titles — no company is named here, so a
    // bet's titles ("Associate") would match everyone.
    if (location) {
      const every = Array.from(new Set([...roleTitleTerms, ...adjacent]))
      const radius = (location.radius_km ?? DEFAULT_RADIUS_KM) * 3
      level('Wider location', keep(
        { ...location, id: `${location.id}-loc`, radius_km: radius, label: null, from: location.id },
        every.length ? { id: 'ip-role-titles-loc', kind: roleTitles?.kind ?? 'title_current', values: every, label: null } : undefined,
      ), `within ${radius} km`, true)
    }
  }

  if (betRows.length) {
    betLevels()
  } else {
    // A pool's own titles, alongside the role's. The profile's titles are what the seat is
    // called ("Strategy Manager"); a pool also says what its people are called where they
    // sit today ("McKinsey · Business Analyst / Associate / Consultant"). Searching McKinsey
    // for a current "Strategy Manager" finds almost nobody, so the consulting bet — the
    // one the brief wants first — was never reached. Each company lane therefore searches
    // the role's titles OR its pool's titles. Titles are sourcing lanes, never a gate, so
    // widening them here orders the search and rejects no one.
    const poolTitles = (p: (typeof poolSorted)[number] | undefined, id: string): SearchCriterion | undefined => {
      if (!titles || !p) return titles
      const own = Array.from(new Set((p.role_types ?? []).flatMap(roleTerms)))
      const extra = own.filter((t) => !titles.values.some((v) => v.toLowerCase() === t.toLowerCase()))
      return extra.length ? { ...titles, id, values: [...titles.values, ...extra], label: null } : titles
    }

    // "Currently at McKinsey" should mean currently CONSULTING there — an engineer at
    // McKinsey matches the employer, not the bet. Only on current-employer lanes: someone
    // who has left consulting is exactly who the "formerly at" lanes are for.
    const current = companies?.kind === 'employer_current'
    const consultingOnly = (p: (typeof poolSorted)[number] | undefined, id: string): SearchCriterion | undefined =>
      current && p && poolKind({ label: p.label ?? '', companies: p.companies ?? [] }) === 'consulting'
        ? { id, kind: 'function', values: ['Consulting'], label: null }
        : undefined

    // L1: the exact persona — each ideal company its own lane (distinct recruiter bets).
    // Keep the ideal-profile ids so a person bought at L1 is vendor-verified on the must-haves
    // (the title id too, with the first pool's titles added — the same way the company id
    // is kept with one company in it).
    const idealTerms = companies?.values ?? []
    if (idealTerms.length) {
      const idealTitles = poolTitles(poolSorted[0], titles?.id ?? '')
      const fn = consultingOnly(poolSorted[0], `${companies!.id}-fn`)
      // One lane per COMPANY, not per search term: "Boston Consulting Group (BCG)" is two
      // terms for one firm, and a lane each searched (and paid for) the same people twice.
      const lanes: string[][] = []
      const placed = new Set<string>()
      for (const entry of poolSorted[0]?.companies ?? []) {
        const group = employerTerms(entry).filter((t) => idealTerms.includes(t) && !placed.has(t))
        group.forEach((t) => placed.add(t))
        if (group.length) lanes.push(group)
      }
      for (const t of idealTerms) if (!placed.has(t)) lanes.push([t])  // added by hand on Scoring
      for (const group of lanes) level(`Ideal profile · ${group[0]}`, keep(location, school, idealTitles, { ...(companies as SearchCriterion), values: group, label: null }, fn), null, false, true)
    } else {
      level('Ideal profile', keep(location, school, titles, companies), null, false, true)
    }

    // Company tiers: one level PER subsequent feeder pool, in priority order, SAME title.
    const seen = new Set(idealTerms.map((t) => t.toLowerCase()))
    if (companies) {
      for (const p of poolSorted.slice(1)) {
        const terms = Array.from(new Set((p.companies ?? []).flatMap(employerTerms))).filter((t) => !seen.has(t.toLowerCase()))
        if (!terms.length) continue
        terms.forEach((t) => seen.add(t.toLowerCase()))
        const rel = p.relationship ? REL_LABEL[p.relationship] : null
        const tierTitles = poolTitles(p, `${titles?.id}-p-${slug(p.label)}`)
        level(rel ? `${rel}: ${p.label}` : p.label, keep(location, school, tierTitles, companyLane(terms, p.label), consultingOnly(p, `${companies.id}-fn-${slug(p.label)}`)), p.rationale ?? (p.relationship?.replace(/_/g, ' ') ?? null))
      }
    }

    // Formerly at the target companies: the same persona who has since moved on. A
    // McKinsey consultant now running ops at a startup, or an engineering manager who left
    // Rippling for another company, is still the bet — just not the first place to look.
    // So after every current-employer lane, each pool again in priority order: worked there
    // before, and held one of the titles at some point, wherever they are today.
    const pastLanes = companies && current ? poolSorted : []
    const seenPast = new Set<string>()
    for (const p of pastLanes) {
      const terms = Array.from(new Set((p.companies ?? []).flatMap(employerTerms))).filter((t) => !seenPast.has(t.toLowerCase()))
      if (!terms.length) continue
      terms.forEach((t) => seenPast.add(t.toLowerCase()))
      const everHeld = titles ? { ...(poolTitles(p, '') as SearchCriterion), id: `${titles.id}-was-${slug(p.label)}`, kind: 'title_any' as const, label: null } : undefined
      const past: SearchCriterion = { ...(companies as SearchCriterion), id: `${companies!.id}-was-${slug(p.label)}`, kind: 'employer_past', values: terms, label: null }
      level(`Formerly at: ${p.label}`, keep(location, school, everHeld, past), 'still there → moved on (any current company)')
    }

    // The brief named no peers — still widen companies (same title) before touching titles.
    if (companies && poolSorted.length <= 1) level('Any company · same title', keep(location, school, titles), 'no company constraint — same title')

    // Tier-2 schools: one pass over every target company (current or former), every title.
    const country = ctx.roleContext?.market?.country ?? resolveLocationParts(location?.values[0] ?? null)?.country_code ?? null
    const tier2 = school ? schoolTiers(brief, country).tier2 : []
    if (school && tier2.length) {
      const allTerms = Array.from(new Set(poolSorted.flatMap((p) => (p.companies ?? []).flatMap(employerTerms))))
      const allTitles = titles ? Array.from(new Set([...titles.values, ...poolSorted.flatMap((p) => (p.role_types ?? []).flatMap(roleTerms))])) : []
      level('Tier-2 school · target companies', keep(
        location,
        { ...school, id: `${school.id}-t2`, values: tier2, label: null },
        titles ? { ...titles, id: `${titles.id}-all`, kind: 'title_any', values: allTitles, label: null } : undefined,
        companies && allTerms.length ? { ...companies, id: `${companies.id}-t-all-targets-any`, kind: 'employer_any', values: allTerms, label: null } : undefined,
      ), 'tier-1 schools → tier-2 schools')
    }

    // Title progression: feeder titles across the SAME broadened companies, then any company.
    const adjacent = Array.from(new Set((brief?.adjacent_titles ?? []).flatMap(titleTerms))).filter((t) => !(titles?.values ?? []).includes(t))
    if (titles && adjacent.length) {
      const adjTitles: SearchCriterion = { ...titles, id: `${titles.id}-adj`, values: adjacent, label: null }
      const allCompanies = Array.from(new Set(poolSorted.flatMap((p) => (p.companies ?? []).flatMap(employerTerms))))
      if (companies && allCompanies.length) {
        level('Feeder titles · target companies', keep(location, companyLane(allCompanies, 'all-targets'), adjTitles), `career-progression titles at the same companies: ${adjacent.slice(0, 4).join(' / ')}${adjacent.length > 4 ? ' …' : ''}`)
      }
      level('Feeder titles · any company', keep(location, { ...adjTitles, id: `${titles.id}-adj-any` }), 'feeder titles, no company constraint', true)
    }

    // Location widens LAST (absent entirely for remote roles).
    if (location) {
      const everyTitle = titles ? { ...titles, id: `${titles.id}-loc`, values: Array.from(new Set([...titles.values, ...adjacent])), label: null } : undefined
      const radius = (location.radius_km ?? DEFAULT_RADIUS_KM) * 3
      level('Wider location', keep({ ...location, id: `${location.id}-loc`, radius_km: radius, label: null, from: location.id }, everyTitle), `within ${radius} km`, true)
    }
  }

  // Seniority ceiling as before: an IC band means no executive titles.
  const band = base.find((c) => c.kind === 'years_band')
  if (band?.max != null && band.max <= IC_SENIORITY_CEILING_YEARS && !all.some((c) => c.kind === 'seniority')) {
    base.push({ id: cid('sen'), kind: 'seniority', values: SENIOR_TITLES, exclude: true, label: 'Not an executive title' })
  }
  for (const g of icp.must_haves ?? []) if (g.attribute === 'screening') post_fetch.push({ label: g.label ?? '', how: 'screen' })
  for (const c of icp.competencies ?? []) post_fetch.push({ label: c.name, how: 'judge' })
  void ctx
  return fitLabels({ version: 1, base, levels, post_fetch, source: 'brief' })
}

interface LinkSources {
  /** The ICP's structured must-haves by id (ideal-profile ids are `ip-…`). */
  mustHaves: Map<string, SearchCriterion>
  /** Every filter the ladder derives from the profile for its widening levels, by id
   *  (`ip-titles-adj`, `ip-location-loc`, `ip-companies-t-growth-stage-saas`, …). */
  derived: Map<string, SearchCriterion>
}

/** The widening-level filters a fresh ladder builds from the profile, by id. Ideal lines
 *  are skipped: they reuse one id per company with different values. PURE. */
function derivedCriteria(fresh: SearchSpec | null): Map<string, SearchCriterion> {
  const out = new Map<string, SearchCriterion>()
  for (const l of fresh?.levels ?? []) {
    if (l.ideal) continue
    for (const c of l.criteria) if (!out.has(c.id)) out.set(c.id, c)
  }
  return out
}

/** A filter that is a copy of a profile field (as opposed to one the recruiter added). */
const isProfileCopy = (c: SearchCriterion) => c.linked === true || c.from != null || c.id.startsWith('ip-')

/**
 * Bring one saved widening level in line with the CURRENT profile. PURE.
 *  - a copy of a must-have (same id) takes the must-have's current value;
 *  - a filter the ladder derives from the profile (feeder titles, company tiers, the
 *    widened location…) takes its freshly derived value;
 *  - a widened copy (`from`) takes the must-have's values but keeps its own radius;
 *  - a filter the recruiter added by hand is left alone.
 * A level whose profile copy no longer exists (the field was removed on Scoring) has
 * lost what defined it, so it is dropped rather than searched half-built.
 */
export function refreshWideningLevel(level: SearchLevel, link: LinkSources): SearchLevel | null {
  const criteria: SearchCriterion[] = []
  for (const c of level.criteria) {
    const mh = link.mustHaves.get(c.id)
    const derived = link.derived.get(c.id)
    const source = c.from ? link.mustHaves.get(c.from) : undefined
    if (mh) criteria.push({ ...mh, label: null, linked: true })
    else if (derived) criteria.push({ ...derived, linked: true })
    else if (source) criteria.push({ ...c, kind: source.kind, values: source.values, exclude: source.exclude, linked: true })
    else if (isProfileCopy(c)) return null
    else criteria.push(c)
  }
  return criteria.length ? { ...level, criteria } : null
}

/** An ideal-profile line. Plans saved before the `ideal` flag are recognised by the label
 *  the ladder gives them. PURE. */
export function isIdealLevel(l: Pick<SearchLevel, 'ideal' | 'label'>): boolean {
  return l.ideal === true || /^Ideal profile\b/.test(l.label)
}

/** A plan filter's label is capped at 120 characters (searchSpecSchema). */
const PLAN_LABEL_MAX = 120

/**
 * Drop a filter label the plan cannot save. A plan copies profile rows, and a profile
 * label may run to 200 characters — the School row's list of institutes is ~140 — so
 * saving an edited plan failed with "Validation failed". The label is only a readable
 * phrase (the plan editor shows the values); without one the kind name is shown. PURE.
 */
export function fitLabels(spec: SearchSpec): SearchSpec {
  const fit = (c: SearchCriterion): SearchCriterion => (c.label && c.label.length > PLAN_LABEL_MAX ? { ...c, label: null } : c)
  return { ...spec, base: spec.base.map(fit), levels: spec.levels.map((l) => ({ ...l, criteria: l.criteria.map(fit) })) }
}

/**
 * Which bet a search level belongs to: the bet whose companies or titles row it searches
 * (the ladder's copies keep the row id as a prefix — `ip-bet-3-companies-was`). Levels
 * that search every bet at once (tier-2, feeder titles, wider location) belong to none.
 * PURE.
 */
export function levelBet(level: Pick<SearchLevel, 'criteria'>, betRowIds: Map<string, number>): number | null {
  const found = new Set<number>()
  for (const c of level.criteria) {
    for (const [id, n] of Array.from(betRowIds.entries())) if (c.id === id || c.id.startsWith(`${id}-`)) found.add(n)
  }
  return found.size === 1 ? Array.from(found)[0] : null
}

/**
 * Put each bet's OWN profile rows (Scoring → "Only this bet") into that bet's levels. PURE.
 *  - the shared row in the level (location, school…) is swapped for the bet's version;
 *  - a shared row on the base line (years…) is overridden in the level (`replaces`), and
 *    the compiler leaves the base copy out of that lane;
 *  - a row only this bet has is added to its levels.
 * Levels shared by every bet keep the shared rows.
 */
export function applyBetOverrides(spec: SearchSpec, mustHaves: Icp['must_haves'] | null | undefined): SearchSpec {
  const all = (mustHaves ?? []).map(toCriterion).filter((c): c is SearchCriterion => c != null)
  const overrides = all.filter((c) => isBetOverride(c))
  if (!overrides.length) return spec
  const betRowIds = new Map(all.filter((c) => c.bet != null && !isBetOverride(c)).map((c) => [c.id, c.bet as number]))
  const sharedIds = new Set(all.filter((c) => c.bet == null).map((c) => c.id))
  const baseIds = new Set(spec.base.map((c) => c.id))
  const levels = spec.levels.map((lvl) => {
    const n = levelBet(lvl, betRowIds)
    const mine = n == null ? [] : overrides.filter((o) => o.bet === n)
    if (!mine.length) return lvl
    const criteria = [...lvl.criteria]
    for (const o of mine) {
      const baseId = overrideBaseId(o.id)
      const replaces = sharedIds.has(baseId) ? baseId : null
      // linked: a copy of a profile row — read-only in the plan editor (edited on Scoring).
      const row: SearchCriterion = { ...o, label: null, replaces, linked: true }
      const at = criteria.findIndex((c) => c.id === baseId)
      if (at >= 0) criteria[at] = row
      // On the base line, or a row only this bet has: it applies to every level of the
      // bet. A shared row this level already dropped (a widening step) stays dropped.
      else if ((replaces == null || baseIds.has(baseId)) && !criteria.some((c) => c.id === row.id)) criteria.push(row)
    }
    return { ...lvl, criteria }
  })
  return { ...spec, levels }
}

/** A stored level without the bet rows applyBetOverrides put there, the shared row back in its place. PURE. */
function withoutBetOverrides(level: SearchLevel, shared: Map<string, SearchCriterion>, baseIds: Set<string>): SearchLevel {
  const criteria: SearchCriterion[] = []
  for (const c of level.criteria) {
    if (!c.id.includes('@bet')) { criteria.push(c); continue }
    const back = c.replaces && !baseIds.has(c.replaces) ? shared.get(c.replaces) : undefined
    if (back && !level.criteria.some((x) => x.id === back.id)) criteria.push({ ...back, label: null, linked: true })
  }
  return { ...level, criteria }
}

/** The spec to acquire with: the recruiter-edited one stored on the ICP, else derived from the brief. */
export function resolveSearchSpec(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'competencies'>>,
  ctx: SpecContext = {},
): { spec: SearchSpec; stored: boolean } {
  // Built from the rows every bet shares; each bet's own rows go into its levels last.
  const withBets = icp.must_haves
  const r = resolveSharedSpec({ ...icp, must_haves: jobWideMustHaves(icp.must_haves) }, ctx)
  return { spec: fitLabels(applyBetOverrides(r.spec, withBets)), stored: r.stored }
}

function resolveSharedSpec(
  icp: Pick<Icp, 'must_haves'> & Partial<Pick<Icp, 'sourcing_map' | 'competencies'>>,
  ctx: SpecContext,
): { spec: SearchSpec; stored: boolean } {
  const stored = icp.sourcing_map?.search_spec
  if (stored && stored.levels?.length) {
    // One source of truth: the ICP's must-haves (edited on the Scoring tab) flow into
    // EVERY part of a saved plan — the "Everyone" base line and the ideal-profile lines
    // are rebuilt, and every copy of a profile field inside the widening levels is
    // refreshed (refreshWideningLevel). What the recruiter added by hand stays theirs.
    const all = (icp.must_haves ?? []).map(toCriterion).filter((c): c is SearchCriterion => c != null)
    const mustHaves = all.filter((c) => c.relax_at == null)
    const fresh = ladderFromIdealProfile(icp, ctx)
    const idealNow = (fresh?.levels ?? []).filter((l) => l.ideal)
    const link: LinkSources = {
      mustHaves: new Map(all.map((c) => [c.id, c])),
      derived: derivedCriteria(fresh),
    }
    // Keep level ids unique: the rebuilt ideal lines are numbered L1…Ln and may collide
    // with a stored widening level's id when the ideal company count changed.
    const idealIds = new Set(idealNow.map((l) => l.id))
    // A saved plan carries the bet rows applied when it was saved; they are re-applied
    // from today's profile, so take them out first (a removed override must not linger).
    const baseIds = new Set(stored.base.map((c) => c.id))
    const widening = stored.levels
      .filter((l) => !isIdealLevel(l))
      .map((l) => withoutBetOverrides(l, link.mustHaves, baseIds))
      .map((l) => refreshWideningLevel(l, link))
      .filter((l): l is SearchLevel => l != null)
      .map((l) => (idealIds.has(l.id) ? { ...l, id: `${l.id}-p` } : l))
    const levels = idealNow.length ? [...idealNow, ...widening] : widening
    // The "checked after fetch" list is the ICP's competencies / screening — follow it too.
    const post_fetch = (fresh ?? specFromIcp(icp, ctx)).post_fetch
    return { spec: fitLabels({ ...stored, base: mustHaves.length ? mustHaves : stored.base, levels, post_fetch }), stored: true }
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
