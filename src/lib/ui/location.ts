/**
 * "Bengaluru, Karnataka, India" — the way a profile header names a place.
 *
 * WHY ALL THREE PARTS. City alone is ambiguous across markets (Cambridge, Springfield,
 * Hyderabad) and country alone is useless for a recruiter deciding whether someone is
 * commutable. The state is the part that makes the other two mean something, and we
 * hold it for 409 of 423 pool profiles — it was being thrown away by a `city ?? region`
 * that treated them as alternatives rather than as a hierarchy.
 *
 * DUPLICATES COLLAPSE. Singapore's city, region and country are all "Singapore", and
 * printing it three times reads as a bug. Comparison is case-insensitive and ignores
 * surrounding space, so "New Delhi" and "new delhi " are one part.
 *
 * PURE.
 */
export interface Place {
  location_city?: string | null
  location_region?: string | null
  location_country?: string | null
}

export function formatLocation(p: Place | null | undefined): string | null {
  const parts = [p?.location_city, p?.location_region, p?.location_country]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const unique = parts.filter((s) => {
    const key = s.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return unique.length ? unique.join(', ') : null
}
