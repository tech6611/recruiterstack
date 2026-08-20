/**
 * The fit bucket is a pure function of the score (+ whether hard gates passed).
 * Kept in its own dependency-free module so the UI can DERIVE the band from the
 * stored score at display time — a match sourced before a bucketing change still
 * carries an old band in the cache, so we never trust the stored label for display.
 */

export type FitBucket = 'great' | 'good' | 'okay' | 'weak'

/** Four bands: >=80 great, >=60 good, >=40 okay, <40 weak. Failing a hard
 *  deal-breaker REJECTS: it forces the lowest band ("weak") regardless of score.
 *  (The Fit Engine also floors the score itself on a gate failure, so callers that
 *  don't pass `passedGates` still read a reject correctly.) PURE. */
export function fitBucketFor(score: number, passedGates = true): FitBucket {
  const s = Number.isFinite(score) ? score : 0
  if (!passedGates) return 'weak'
  return s >= 80 ? 'great' : s >= 60 ? 'good' : s >= 40 ? 'okay' : 'weak'
}
