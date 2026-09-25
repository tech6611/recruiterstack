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
  return { id: g.id, kind: g.kind, values: g.values ?? [], min: g.min ?? null, max: g.max ?? null, radius_km: g.radius_km ?? null, exclude: g.exclude ?? false, label: g.label, relax_at: g.relax_at ?? null }
}

/** "6–12 years" · "Within 50 km of New York" · "Any title held: Engineering Manager / Tech Lead Manager". */
export function criterionLabel(c: Pick<SearchCriterion, 'kind' | 'values' | 'min' | 'max' | 'radius_km' | 'exclude'>): string {
  const list = (c.values ?? []).join(' / ')
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
    // Employer AND positive-title lists in a relaxation ladder are target-market search
    // lanes — "find these titles at these companies, then widen to logical peers". They
    // guide sourcing and ranking, not candidate eligibility. An exclusion ("not a TPM")
    // carries no relax_at, so it correctly stays a hard gate.
    enforcement: (c.kind.startsWith('employer_') || c.kind.startsWith('title_')) && c.relax_at != null ? 'sourcing_only' : 'hard',
  }
}

/** True when a row is a target-market instruction rather than a candidate gate. */
export function isSourcingOnlyCriterion(g: Pick<IcpMustHave, 'kind' | 'relax_at' | 'enforcement'>): boolean {
  // Fallback keeps existing ICPs created before `enforcement` on the correct side.
  // A relaxable employer OR positive-title row is a search lane, not a gate; an
  // exclusion (no relax_at) is not a lane and stays hard.
  const isLane = Boolean(g.kind?.startsWith('employer_') || g.kind?.startsWith('title_'))
  return g.enforcement === 'sourcing_only' || (g.enforcement == null && isLane && g.relax_at != null)
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
