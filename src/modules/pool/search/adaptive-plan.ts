/**
 * #3 — the adaptive planner (docs/recruiter-brain-sourcing.md). A recruiter doesn't run
 * a fixed ladder; they look at the yield and decide the next move. This loop probes each
 * level's reach, and while the plan is below the per-role target it asks the brain for the
 * next expansion (more same-space companies at the same title → feeder titles → wider
 * location), appends it, and re-probes — until the target is met or the brain has no more
 * moves. It PROPOSES a plan (spec + reasoning + per-level counts); it never acquires — the
 * recruiter edits/approves before spending vendor credits.
 *
 * The vendor probe and the LLM next-move are INJECTED, so the loop itself is pure and
 * fully testable. See the route for the live wiring.
 */
import type { SearchSpec, SearchLevel, SearchCriterion, CriterionKind } from '@/lib/types/search-spec'

export interface LevelCount { key: string; label?: string; total: number | null }

export interface AdaptiveMove {
  kind: 'more_companies' | 'feeder_titles' | 'wider_location'
  /** Short recruiter-readable level label, e.g. "Same-space peers: Greenhouse, Lever, Ashby". */
  label: string
  companies?: string[]
  titles?: string[]
  /** Why a recruiter makes this move now. */
  rationale: string
}

export interface NextMoveContext {
  reach: number
  target: number
  remaining: number
  levels: { label: string; total: number | null }[]
}

export interface AdaptivePlanStep {
  move: AdaptiveMove | null
  reachAfter: number
  levelsAfter: number
}

export interface AdaptivePlanResult {
  /** The proposed (possibly expanded) plan — recruiter reviews/edits before acquiring. */
  spec: SearchSpec
  target: number
  reach: number
  met: boolean
  steps: AdaptivePlanStep[]
  /** Every probed level's count; `fallback` = a catch-all that does NOT count toward the target. */
  perLevel: { label: string; total: number | null; fallback?: boolean }[]
  /** True when the loop hit its safety expansion cap before meeting the target (surfaced, never silent). */
  capped: boolean
}

/** Reachable count across ALL levels (overlap-agnostic upper estimate). PURE. */
export function planReach(counts: LevelCount[]): number {
  return counts.reduce((s, c) => s + (c.total ?? 0), 0)
}

/**
 * The reach that decides "too thin?": the sum EXCLUDING catch-all fallback levels
 * (feeder-titles-at-any-company, wider-location). Those are always huge and would hide a
 * thin ideal, so they must never count toward the target — otherwise the planner declares
 * success while the real ideal found nobody. Matches counts to levels by label. PURE.
 */
export function qualifiedReach(counts: LevelCount[], spec: SearchSpec): number {
  const fb = new Set(spec.levels.filter((l) => l.fallback).map((l) => l.label))
  return counts.filter((c) => !fb.has(c.label ?? '')).reduce((s, c) => s + (c.total ?? 0), 0)
}

const dedupe = (xs: string[]): string[] => Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)))

/** The ideal level's location / title / employer criteria, reused as templates for new levels. */
function templates(spec: SearchSpec): { location?: SearchCriterion; title?: SearchCriterion; employer?: SearchCriterion } {
  const l1 = spec.levels[0]?.criteria ?? []
  return {
    location: l1.find((c) => c.kind === 'location'),
    title: l1.find((c) => c.kind.startsWith('title_') && !c.exclude),
    employer: l1.find((c) => c.kind.startsWith('employer_')),
  }
}

/** Append a level built from the brain's proposed move. PURE. */
export function applyMove(spec: SearchSpec, move: AdaptiveMove, seq: number): SearchSpec {
  const t = templates(spec)
  const cid = (k: string) => `adapt-${seq}-${k}`
  const employerKind: CriterionKind = t.employer?.kind ?? 'employer_current'
  const titleKind: CriterionKind = t.title?.kind ?? 'title_current'
  const criteria: SearchCriterion[] = []

  if (move.kind === 'more_companies') {
    const companies = dedupe(move.companies ?? [])
    if (!companies.length) return spec
    if (t.location) criteria.push(t.location)
    if (t.title) criteria.push(t.title)
    criteria.push({ id: cid('emp'), kind: employerKind, values: companies, label: null })
  } else if (move.kind === 'feeder_titles') {
    const titles = dedupe(move.titles ?? [])
    if (!titles.length) return spec
    if (t.location) criteria.push(t.location)
    // Apply the feeder titles across every company the plan already knows.
    const known = dedupe(spec.levels.flatMap((l) => l.criteria.filter((c) => c.kind.startsWith('employer_')).flatMap((c) => c.values)))
    if (known.length) criteria.push({ id: cid('emp'), kind: employerKind, values: known, label: null })
    criteria.push({ id: cid('title'), kind: titleKind, values: titles, label: null })
  } else {
    // wider_location — only meaningful when the plan has a location dimension.
    if (!t.location) return spec
    criteria.push({ ...t.location, id: cid('loc'), radius_km: (t.location.radius_km ?? 50) * 3, label: null })
    if (t.title) criteria.push(t.title)
  }

  const level: SearchLevel = { id: `LA${seq + 1}`, label: move.label, criteria, relaxes: move.rationale, rationale: move.rationale }
  return { ...spec, levels: [...spec.levels, level] }
}

const DEFAULT_MAX_EXPANSIONS = 8

/**
 * Run the adaptive planning loop. `probe` sizes a spec's levels (vendor limit:1 counts);
 * `nextMove` is the brain proposing the next expansion (null = "no more moves"). Pure
 * except for the two injected async calls, so it is fully testable with fakes.
 */
export async function runAdaptivePlan(opts: {
  spec: SearchSpec
  target: number
  probe: (spec: SearchSpec) => Promise<LevelCount[]>
  nextMove: (ctx: NextMoveContext) => Promise<AdaptiveMove | null>
  maxExpansions?: number
}): Promise<AdaptivePlanResult> {
  const max = opts.maxExpansions ?? DEFAULT_MAX_EXPANSIONS
  let spec = opts.spec
  let counts = await opts.probe(spec)
  let reach = qualifiedReach(counts, spec)
  const steps: AdaptivePlanStep[] = [{ move: null, reachAfter: reach, levelsAfter: spec.levels.length }]
  let capped = false
  let expansions = 0

  while (reach < opts.target) {
    if (expansions >= max) { capped = true; break }
    const move = await opts.nextMove({
      reach,
      target: opts.target,
      remaining: Math.max(0, opts.target - reach),
      levels: counts.map((c) => ({ label: c.label ?? c.key, total: c.total })),
    })
    if (!move) break // the brain has no next move — stop widening.
    const next = applyMove(spec, move, expansions)
    if (next === spec) break // move added nothing usable.
    spec = next
    counts = await opts.probe(spec)
    reach = qualifiedReach(counts, spec)
    steps.push({ move, reachAfter: reach, levelsAfter: spec.levels.length })
    expansions++
  }

  const fbLabels = new Set(spec.levels.filter((l) => l.fallback).map((l) => l.label))
  return {
    spec,
    target: opts.target,
    reach,
    met: reach >= opts.target,
    steps,
    perLevel: counts.map((c) => ({ label: c.label ?? c.key, total: c.total, fallback: fbLabels.has(c.label ?? '') })),
    capped,
  }
}
