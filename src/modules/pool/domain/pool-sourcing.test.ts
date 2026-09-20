import { describe, it, expect } from 'vitest'
// ── Everyone line applied to pool recall ───────────────────────────────────────
import { outsidePlanReason } from './pool-sourcing'

describe('outsidePlanReason', () => {
  const plan = { city: 'New York', locationText: 'New York, New York, United States', minYears: 6, maxYears: 12 }
  it('marks a known different city and years outside the band (with a year of tolerance)', () => {
    expect(outsidePlanReason({ location: 'Bengaluru, India', experience_years: 8 }, plan)).toBe('Bengaluru, not New York')
    expect(outsidePlanReason({ location: 'New York, United States', experience_years: 3 }, plan)).toBe('3 yrs, under 6')
    expect(outsidePlanReason({ location: 'New York, United States', experience_years: 14 }, plan)).toBe('14 yrs, over 12')
    expect(outsidePlanReason({ location: 'New York, United States', experience_years: 12.5 }, plan)).toBeNull()
  })
  it('never marks acquired people, unknown cities, or when there is no plan', () => {
    expect(outsidePlanReason({ location: 'Bengaluru', experience_years: 2, acquired: { level: 1 } }, plan)).toBeNull()
    expect(outsidePlanReason({ location: 'Somewhere', experience_years: 8 }, plan)).toBeNull()
    expect(outsidePlanReason({ location: 'Bengaluru', experience_years: 8 }, null)).toBeNull()
  })
})
