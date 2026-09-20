import { describe, it, expect } from 'vitest'
// ── Everyone line applied to pool recall ───────────────────────────────────────
import { outsidePlanReason, withLiveLocations, type PoolMatch } from './pool-sourcing'

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

describe('withLiveLocations', () => {
  const fakeSb = (rows: Record<string, unknown>[]) =>
    ({ from: () => ({ select: () => ({ in: async () => ({ data: rows }) }) }) }) as unknown as Parameters<typeof withLiveLocations>[0]
  const match = (profile_id: string, location: string | null) => ({ profile_id, location }) as unknown as PoolMatch

  it('replaces the snapshot text with the standardised city / country from pool_profiles', async () => {
    const sb = fakeSb([
      { id: 'a', location_city: 'New York', location_region: 'New York', location_country: 'United States', location_country_code: 'US', location_raw: 'New York, New York, United States' },
      { id: 'b', location_city: 'Bengaluru', location_region: 'Karnataka', location_country: 'India', location_country_code: 'IN', location_raw: 'Bangalore' },
    ])
    const out = await withLiveLocations(sb, [match('a', 'New York, New York, United States'), match('b', 'Bengaluru')])
    expect(out.map((m) => m.location)).toEqual(['New York, United States', 'Bengaluru, India'])
  })
  it('keeps the snapshot text when the profile is gone or has no location', async () => {
    const sb = fakeSb([{ id: 'a', location_city: null, location_region: null, location_country: null, location_country_code: null, location_raw: null }])
    const out = await withLiveLocations(sb, [match('a', 'Somewhere'), match('zzz', 'Elsewhere')])
    expect(out.map((m) => m.location)).toEqual(['Somewhere', 'Elsewhere'])
  })
})
