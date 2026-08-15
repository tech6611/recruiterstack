/**
 * Cold-start calibration sampling (Component 05, Slice 5b).
 *
 * Picks a DIVERSE subset of sourcing matches for the recruiter to decide on —
 * spread evenly across the score range so the set spans clear-yes, clear-no, and
 * the uncertain middle (the borderline cases, where a recruiter's yes/no carries
 * the most signal). Deterministic + pure so it's testable. See the cold-start
 * reasoning: ~15 diverse decisions calibrate an ICP faster than 15 similar ones.
 */

export function pickCalibrationSet<T extends { score: number }>(matches: T[], limit: number): T[] {
  if (limit <= 0) return []
  if (matches.length <= limit) return [...matches]

  const sorted = [...matches].sort((a, b) => b.score - a.score)
  const picks: T[] = []
  const seen = new Set<number>()

  for (let i = 0; i < limit; i++) {
    let idx = Math.round((i * (sorted.length - 1)) / (limit - 1))
    // De-dup rounding collisions by nudging to the nearest free rank.
    while (seen.has(idx) && idx < sorted.length - 1) idx++
    while (seen.has(idx) && idx > 0) idx--
    if (!seen.has(idx)) {
      seen.add(idx)
      picks.push(sorted[idx])
    }
  }
  return picks
}
