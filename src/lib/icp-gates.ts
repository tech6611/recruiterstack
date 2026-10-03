/**
 * Shared helpers for reading experience gates off an ICP. Used by the ICP generator
 * (to build the band gate), the Crustdata search plan (to send it as filters) and the
 * Fit Engine (to enforce it deterministically). PURE + tested.
 */
import type { IcpMustHave } from '@/lib/types/icp'
import type { SearchCriterion, CriterionKind } from '@/lib/types/search-spec'
import { CRITERION_KIND_LABEL } from '@/lib/types/search-spec'

/** The attribute a structured experience-band gate carries: value = [min, max] years. */
export const EXPERIENCE_BAND_ATTRIBUTE = 'experience_band'
export const EXPERIENCE_BAND_GATE_ID = 'g-band'

/** A years floor from a plain-sentence gate ("at least 2 full years…", "5+ years"). */
export function yearsFloorFromLabel(label: string): number | null {
  if (!/\b(?:years?|yrs)\b/i.test(label)) return null
  const m = label.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:full[- ]?time\s+|full\s+)?(?:years?|yrs)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 && n < 60 ? n : null
}

export interface ExperienceBand {
  min: number | null
  max: number | null
}

/** Read the [min, max] band off a structured experience_band gate, if that's what it is. */
export function experienceBandFromGate(g: Pick<IcpMustHave, 'attribute' | 'value'>): ExperienceBand | null {
  if ((g.attribute ?? '').toLowerCase() !== EXPERIENCE_BAND_ATTRIBUTE) return null
  const v = Array.isArray(g.value) ? g.value : typeof g.value === 'string' ? g.value.split(/[-–,]/) : [g.value]
  const num = (x: unknown) => {
    const t = String(x ?? '').trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 && n < 80 ? n : null
  }
  const min = num(v[0])
  const max = num(v[1])
  if (min == null && max == null) return null
  return { min, max }
}

/** Build the structured band gate the ICP carries. Label is the plain question the judge reads. */
export function experienceBandGate(min: number | null, max: number | null): IcpMustHave | null {
  if (min == null && max == null) return null
  const label =
    min != null && max != null
      ? `Has between ${min} and ${max} years of professional experience — not over-senior for this role?`
      : min != null
        ? `Has at least ${min} years of professional experience?`
        : `Has no more than ${max} years of professional experience — not over-senior for this role?`
  return { id: EXPERIENCE_BAND_GATE_ID, label, attribute: EXPERIENCE_BAND_ATTRIBUTE, operator: 'between', value: [String(min ?? ''), String(max ?? '')] }
}

// ── Structured must-haves: a must-have IS a search criterion ─────────────────────
// (docs/structured-must-haves-plan.md). These accessors are shared by the spec builder,
// the gate evaluator and the Fit Engine; they depend on nothing but the types.

/** A must-have carrying a structured criterion (vs. a legacy free-text gate). */
export function isCriterion(g: Pick<IcpMustHave, 'kind'> | null | undefined): g is IcpMustHave & { kind: CriterionKind } {
  return Boolean(g && typeof g.kind === 'string' && g.kind in CRITERION_KIND_LABEL)
}

/** The criterion view of a structured must-have (null for a legacy gate). */
export function toCriterion(g: IcpMustHave): SearchCriterion | null {
  if (!isCriterion(g)) return null
  return { id: g.id, kind: g.kind, values: g.values ?? [], min: g.min ?? null, max: g.max ?? null, radius_km: g.radius_km ?? null, exclude: g.exclude ?? false, label: g.label, relax_at: g.relax_at ?? null, ...(g.bet != null ? { bet: g.bet, bet_label: g.bet_label ?? null } : {}) }
}

/** Room for the list inside a label: labels are capped at 200 characters on save
 *  (icpMustHaveSchema), and the longest prefix plus a "+N more" tail must still fit. */
const LIST_BUDGET = 150

/**
 * The values, as many as fit, then "+N more". A label is the readable phrase — the
 * values themselves stay on the row and are what the search sends. Listing every value
 * broke saving: a School row with sixteen institutes made a 329-character label, and
 * the whole profile was refused with "Validation failed".
 */
function shortList(values: string[]): string {
  const out: string[] = []
  let used = 0
  for (const v of values) {
    const add = (out.length ? 3 : 0) + v.length
    if (out.length && used + add > LIST_BUDGET) break
    out.push(v.length > LIST_BUDGET ? `${v.slice(0, LIST_BUDGET - 1)}…` : v)
    used += add
  }
  const rest = values.length - out.length
  return out.join(' / ') + (rest > 0 ? ` +${rest} more` : '')
}

/** "6–12 years" · "Within 50 km of New York" · "Any title held: Engineering Manager / Tech Lead Manager". */
export function criterionLabel(c: Pick<SearchCriterion, 'kind' | 'values' | 'min' | 'max' | 'radius_km' | 'exclude'>): string {
  const list = shortList(c.values ?? [])
  const not = c.exclude ? 'Not ' : ''
  switch (c.kind) {
    case 'years_band':
      return c.min != null && c.max != null ? `${c.min}–${c.max} years` : c.min != null ? `${c.min}+ years` : `Up to ${c.max} years`
    case 'grad_year_band':
      return c.min != null && c.max != null ? `Graduated ${c.min}–${c.max}` : c.min != null ? `Graduated ${c.min} or later` : `Graduated by ${c.max}`
    case 'location':
      return `${not}Within ${c.radius_km ?? 50} km of ${c.values?.[0] ?? '?'}`
    default:
      return `${not}${CRITERION_KIND_LABEL[c.kind]}: ${list}`
  }
}

/** A must-have built from a criterion. The legacy fields mirror it so old readers see something sensible. */
export function mustHaveFromCriterion(c: SearchCriterion, label?: string | null): IcpMustHave {
  return {
    id: c.id,
    label: label ?? c.label ?? criterionLabel(c),
    attribute: c.kind,
    operator: 'criterion',
    value: c.min != null || c.max != null ? [String(c.min ?? ''), String(c.max ?? '')] : c.values,
    kind: c.kind,
    values: c.values,
    min: c.min ?? null,
    max: c.max ?? null,
    radius_km: c.radius_km ?? null,
    exclude: c.exclude ?? false,
    relax_at: c.relax_at ?? null,
    // Employer, positive-title AND school lists in a relaxation ladder are target-market
    // search lanes — "find these titles at these companies, tier-1 schools first, then
    // widen". They guide sourcing and ranking, not candidate eligibility. An exclusion
    // ("not a TPM") carries no relax_at, so it correctly stays a hard gate.
    // Every row of a bet (its companies, titles, exclusions, its own location or years)
    // steers that bet's search only; the shared rows stay the job-wide gates.
    enforcement: (isLaneKind(c.kind) && c.relax_at != null) || c.bet != null ? 'sourcing_only' : 'hard',
    ...(c.bet != null ? { bet: c.bet, bet_label: c.bet_label ?? null } : {}),
  }
}

/**
 * A BET OVERRIDE: one bet's own version of an ideal-profile row every bet otherwise
 * shares (location, years, school…), e.g. "2–4 yrs" for the IB bet while the rest keep
 * "2–6 yrs". A bet's companies and titles are its own rows, not overrides.
 *
 * Its id is the shared row's id + BET_OVERRIDE_SEP + the bet number, so each override
 * knows which row it replaces (a row only one bet has uses a fresh base id).
 */
export function isBetOverride(g: { bet?: number | null; kind?: string | null }): boolean {
  return g.bet != null && !!g.kind && !g.kind.startsWith('employer_') && !g.kind.startsWith('title_')
}
export const BET_OVERRIDE_SEP = '@bet'
export const betOverrideId = (baseId: string, bet: number) => `${baseId}${BET_OVERRIDE_SEP}${bet}`
/** The id of the shared row an override replaces. */
export const overrideBaseId = (id: string) => id.split(BET_OVERRIDE_SEP)[0]

/**
 * The profile without per-bet overrides — what the gates, the judge, the screen and the
 * Copilot read. An override is one bet's search guidance; read as a job-wide row it would
 * apply one bet's location to every candidate. The search plan builds from these rows and
 * then puts each bet's own into its levels (applyBetOverrides in spec-from-brief).
 */
export function jobWideMustHaves<T extends { bet?: number | null; kind?: string | null }>(gates: T[] | null | undefined): T[] {
  return (gates ?? []).filter((g) => !isBetOverride(g))
}

/**
 * One bet's ideal profile: every shared row, replaced by the bet's override where it has
 * one, plus rows only this bet has. Companies/titles are not included (they are the
 * bet's card lines). PURE.
 */
export function betProfile(criteria: SearchCriterion[], bet: number): SearchCriterion[] {
  const own = criteria.filter((c) => c.bet === bet && isBetOverride(c))
  const shared = criteria.filter((c) => c.bet == null)
  const out = shared.map((s) => own.find((o) => o.id === betOverrideId(s.id, bet)) ?? s)
  const sharedIds = new Set(shared.map((s) => s.id))
  return [...out, ...own.filter((o) => !sharedIds.has(overrideBaseId(o.id)))]
}

/** Two criteria that search the same thing (ids, labels and bets aside). */
function sameSearch(a: SearchCriterion, b: SearchCriterion): boolean {
  const vals = (c: SearchCriterion) => c.values.map((v) => v.trim().toLowerCase()).filter(Boolean).sort().join('|')
  return a.kind === b.kind && vals(a) === vals(b) && (a.min ?? null) === (b.min ?? null) && (a.max ?? null) === (b.max ?? null)
    && (a.radius_km ?? null) === (b.radius_km ?? null) && !!a.exclude === !!b.exclude
}

/**
 * Save a profile row edited under one bet. "Every bet" writes the shared row and drops
 * every bet's own version of it; "only this bet" writes (or updates) that bet's
 * override — and drops it again when it ends up the same as the shared row. PURE.
 */
export function saveBetRow(gates: IcpMustHave[], bet: number, betLabel: string, next: SearchCriterion, allBets: boolean): IcpMustHave[] {
  const baseId = overrideBaseId(next.id)
  const shared = gates.find((g) => g.id === baseId && g.bet == null)
  if (allBets) {
    // No bet on it: mustHaveFromCriterion only writes bet fields for a bet's row.
    const row = mustHaveFromCriterion({ ...next, id: baseId, label: null, bet: null, bet_label: null })
    const kept = gates.filter((g) => !(isBetOverride(g) && overrideBaseId(g.id) === baseId))
    return shared ? kept.map((g) => (g.id === baseId ? row : g)) : [...kept, row]
  }
  const id = betOverrideId(baseId, bet)
  const sharedC = shared ? toCriterion(shared) : null
  if (sharedC && sameSearch(sharedC, next)) return gates.filter((g) => g.id !== id)
  const row = mustHaveFromCriterion({ ...next, id, label: null, bet, bet_label: betLabel })
  return gates.some((g) => g.id === id) ? gates.map((g) => (g.id === id ? row : g)) : [...gates, row]
}

/** Remove a row shown under a bet: its override goes back to the shared value; a shared row leaves every bet. PURE. */
export function removeBetRow(gates: IcpMustHave[], c: SearchCriterion): IcpMustHave[] {
  if (c.bet != null) return gates.filter((g) => g.id !== c.id)
  const baseId = overrideBaseId(c.id)
  return gates.filter((g) => g.id !== baseId && !(isBetOverride(g) && overrideBaseId(g.id) === baseId))
}

/** Kinds that, when relaxable, are search lanes rather than gates. */
const isLaneKind = (k: string) => k.startsWith('employer_') || k.startsWith('title_') || k === 'school'

/** True when a row is a target-market instruction rather than a candidate gate. */
export function isSourcingOnlyCriterion(g: Pick<IcpMustHave, 'kind' | 'relax_at' | 'enforcement'> & { bet?: number | null }): boolean {
  // Fallback keeps existing ICPs created before `enforcement` on the correct side.
  // A relaxable employer OR positive-title row is a search lane, not a gate; an
  // exclusion (no relax_at) is not a lane and stays hard.
  const isLane = Boolean(g.kind && isLaneKind(g.kind))
  return g.enforcement === 'sourcing_only' || g.bet != null || (g.enforcement == null && isLane && g.relax_at != null)
}

/**
 * The must-haves an edited plan implies: the base line (never-relaxed rows) plus L1's
 * relaxable rows (those carrying `relax_at`), plus any non-criterion gates the ICP
 * already had (screening). PURE.
 */
export function mustHavesFromSpec(existing: IcpMustHave[] | null | undefined, spec: { base: SearchCriterion[]; levels?: { criteria: SearchCriterion[] }[] }): IcpMustHave[] {
  const keep = (existing ?? []).filter((g) => !isCriterion(g))
  const l1 = (spec.levels?.[0]?.criteria ?? []).filter((c) => c.relax_at != null)
  return [...spec.base.map((c) => mustHaveFromCriterion(c)), ...l1.map((c) => mustHaveFromCriterion(c)), ...keep]
}

/**
 * Ideal-profile ladder: which failed gates are NOT expected for this person. A person
 * bought at level L was deliberately reached with the dimensions that relax at or before
 * L loosened, so missing those is not a failure to fold away — only a miss on a row that
 * never relaxes (years, education) or relaxes later still counts. Pool-recall people
 * (no level) count every miss. PURE.
 */
export function unexpectedGateFailures(
  failedLabels: string[],
  acquiredLevel: number | null | undefined,
  relaxAtByLabel: Record<string, number | null | undefined> | null | undefined,
): string[] {
  if (acquiredLevel == null || !relaxAtByLabel) return failedLabels
  return failedLabels.filter((label) => {
    const at = relaxAtByLabel[label]
    return at == null || at > acquiredLevel
  })
}
