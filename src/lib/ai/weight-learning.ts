/**
 * Weight learning — Stage 2 (v1, interpretable + small-data-safe).
 *
 * The honest first cut of "learn the ICP weights from Yes/No decisions": for each
 * competency, measure how well its 1–4 ratings SEPARATE the recruiter's Yeses from
 * their Nos (mean-difference). A competency whose high ratings track Yes deserves
 * more weight; one that doesn't separate the two deserves less. We then blend the
 * signal-implied weights with the current weights by a CONFIDENCE that grows with the
 * number of decisions — so with little data it barely moves, and it only firms up as
 * evidence accumulates. Fully deterministic, explainable, and advisory (a human still
 * approves the change). Graduates to pooled logistic regression once there's volume.
 *
 * Dependency-free + pure so it is trivially unit-tested.
 */

export interface WeightSignalRow {
  id: string | null
  name: string
  current_weight: number
  n_yes: number
  n_no: number
  mean_yes: number | null
  mean_no: number | null
  separation: number | null // (mean_yes - mean_no) / 3, in roughly [-1, 1]
  suggested_weight: number
}

export interface WeightSignal {
  decided: number       // yes/no decisions considered (maybe excluded)
  confidence: number    // 0..1 shrinkage toward the current weights
  sufficient: boolean   // false when there's too little data to suggest anything
  competencies: WeightSignalRow[]
}

interface Label {
  decision: 'yes' | 'no' | 'maybe'
  competencies: { name: string; rating: number | null }[]
  // Importance of this example: 1 for a decision on THIS job, a fraction for a
  // decision borrowed from a similar job (cross-job pooling). Defaults to 1.
  weight?: number
}
interface CompetencyWeight { id?: string | null; name: string; weight: number }

const MIN_DECISIONS = 5
const SHRINK_K = 12 // (effective) decisions needed to reach 50% confidence

/** Weighted mean of {value, weight} pairs. PURE. */
const wMean = (pairs: { v: number; w: number }[]): number | null => {
  const wsum = pairs.reduce((s, p) => s + p.w, 0)
  return wsum > 0 ? pairs.reduce((s, p) => s + p.v * p.w, 0) / wsum : null
}

/** Rescale to integers summing to 100, absorbing rounding drift on the largest. PURE. */
function normalizeTo100(weights: number[]): number[] {
  const raw = weights.map((w) => Math.max(0, Number.isFinite(w) ? w : 0))
  const total = raw.reduce((a, b) => a + b, 0) || 1
  const scaled = raw.map((w) => Math.round((w / total) * 100))
  const drift = 100 - scaled.reduce((a, b) => a + b, 0)
  if (scaled.length) {
    const iMax = scaled.reduce((best, w, i) => (w > scaled[best] ? i : best), 0)
    scaled[iMax] = Math.max(0, scaled[iMax] + drift)
  }
  return scaled
}

/**
 * Compute the weight signal from labelled decisions. Suggested weights fall back to
 * the current weights when there isn't enough evidence. PURE + tested.
 */
export function computeWeightSignal(
  labels: Label[],
  competencies: CompetencyWeight[],
  opts?: { minDecisions?: number; k?: number },
): WeightSignal {
  const minDecisions = opts?.minDecisions ?? MIN_DECISIONS
  const k = opts?.k ?? SHRINK_K

  const decisive = labels.filter((l) => l.decision === 'yes' || l.decision === 'no')
  const decided = decisive.length
  // Effective sample size counts a borrowed (down-weighted) decision fractionally,
  // so cross-job pooling adds confidence, but less than a decision on this job.
  const effectiveN = decisive.reduce((s, l) => s + (l.weight ?? 1), 0)
  const confidence = effectiveN / (effectiveN + k)

  const rows: WeightSignalRow[] = competencies.map((c) => {
    const nameKey = c.name.trim().toLowerCase()
    const yes: { v: number; w: number }[] = []
    const no: { v: number; w: number }[] = []
    for (const l of decisive) {
      const r = l.competencies.find((x) => x.name.trim().toLowerCase() === nameKey)?.rating
      if (r == null) continue
      if (l.decision === 'yes') yes.push({ v: r, w: l.weight ?? 1 })
      else no.push({ v: r, w: l.weight ?? 1 })
    }
    const mean_yes = wMean(yes)
    const mean_no = wMean(no)
    const separation = mean_yes != null && mean_no != null ? (mean_yes - mean_no) / 3 : null
    return {
      id: c.id ?? null,
      name: c.name,
      current_weight: c.weight,
      n_yes: yes.length,
      n_no: no.length,
      mean_yes,
      mean_no,
      separation,
      suggested_weight: c.weight, // default: unchanged
    }
  })

  const sufficient = effectiveN >= minDecisions && rows.some((r) => r.separation != null)
  if (!sufficient) return { decided, confidence, sufficient: false, competencies: rows }

  // Signal-implied importance = the POSITIVE part of each competency's separation
  // (a competency that doesn't distinguish Yes from No, or does so inversely, earns
  // no signal weight and thus shrinks).
  const importance = rows.map((r) => Math.max(0, r.separation ?? 0))
  const impSum = importance.reduce((s, x) => s + x, 0)
  const currentSum = rows.reduce((s, r) => s + r.current_weight, 0) || 1

  const signalWeights =
    impSum > 0 ? importance.map((x) => (x / impSum) * 100) : rows.map((r) => (r.current_weight / currentSum) * 100)

  const blended = rows.map((r, i) => (1 - confidence) * r.current_weight + confidence * signalWeights[i])
  const suggested = normalizeTo100(blended)
  rows.forEach((r, i) => (r.suggested_weight = suggested[i]))

  return { decided, confidence, sufficient: true, competencies: rows }
}

// ── Structural gaps (Stage 3) ────────────────────────────────────────────────────
// Reweighting can only move the competencies the ICP already has. When the recruiter
// SYSTEMATICALLY disagrees with a confident ICP, the ICP is missing a factor entirely:
//  - rejecting people the ICP rated a fit (and who passed every gate) ⇒ there's an
//    unwritten DISQUALIFIER / missing competency the recruiter screens on.
//  - accepting people the ICP rated a poor fit ⇒ the ICP is too harsh / missing a
//    positive factor those people share.

export interface GapRow {
  decision: 'yes' | 'no' | 'maybe'
  icp_positive: boolean // the ICP rated this candidate a fit
  passed_gates: boolean
}

export interface StructuralDiagnosis {
  decided: number
  reject_despite_positive: number // count: recruiter No, ICP fit + passed gates
  positives: number               // count of ICP-positive, gate-passing candidates
  accept_despite_negative: number // count: recruiter Yes, ICP not a fit
  negatives: number               // count of ICP-negative candidates
  missing_disqualifier: boolean   // a new competency/gate likely needed
  too_harsh: boolean              // the ICP likely over-filters
}

const GAP_MIN = 4          // need a few examples of the pattern
const GAP_RATE = 0.4       // …occurring at least this often

/** Diagnose systematic disagreement that reweighting alone can't fix. PURE + tested. */
export function detectStructuralGaps(rows: GapRow[]): StructuralDiagnosis {
  const decisive = rows.filter((r) => r.decision === 'yes' || r.decision === 'no')
  const positives = decisive.filter((r) => r.icp_positive && r.passed_gates)
  const negatives = decisive.filter((r) => !r.icp_positive)
  const reject_despite_positive = positives.filter((r) => r.decision === 'no').length
  const accept_despite_negative = negatives.filter((r) => r.decision === 'yes').length

  const rejectRate = positives.length ? reject_despite_positive / positives.length : 0
  const acceptRate = negatives.length ? accept_despite_negative / negatives.length : 0

  return {
    decided: decisive.length,
    reject_despite_positive,
    positives: positives.length,
    accept_despite_negative,
    negatives: negatives.length,
    missing_disqualifier: reject_despite_positive >= GAP_MIN && rejectRate >= GAP_RATE,
    too_harsh: accept_despite_negative >= GAP_MIN && acceptRate >= GAP_RATE,
  }
}
