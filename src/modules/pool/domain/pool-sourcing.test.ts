import { describe, it, expect } from 'vitest'
// ── Everyone line applied to pool recall ───────────────────────────────────────
import { outsidePlanReason, withLiveLocations, rankPoolMatches, type PoolMatch } from './pool-sourcing'

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

describe('rankPoolMatches', () => {
  const plan = { city: 'New York', locationText: 'New York, United States', minYears: null, maxYears: null }
  const row = (name: string, o: Partial<PoolMatch>) =>
    ({ profile_id: name, name, location: 'New York, United States', experience_years: 8, score: 50, gate_failures: [], gate_unknown: [], acquired: null, ...o }) as unknown as PoolMatch

  it('re-marks an old snapshot under the current plan and orders inside → ✓ → ? → ✗', () => {
    const out = rankPoolMatches([
      row('blr-clean',   { location: 'Bengaluru, India', score: 90 }),           // wrong city, but perfect gates
      row('ny-failed',   { gate_failures: ['years'], score: 80 }),
      row('ny-unknown',  { gate_unknown: ['relocate'], score: 70 }),
      row('ny-clean-lo', { score: 20 }),
      row('ny-clean-hi', { score: 60 }),
    ], plan)
    expect(out.map((m) => m.name)).toEqual(['ny-clean-hi', 'ny-clean-lo', 'ny-unknown', 'ny-failed', 'blr-clean'])
    expect(out.find((m) => m.name === 'blr-clean')?.outside_plan).toBe('Bengaluru, not New York')
    expect(out.find((m) => m.name === 'ny-clean-hi')?.outside_plan).toBeNull()
  })
  it('never marks acquired people outside the plan, and full match beats relaxed at equal gates', () => {
    const out = rankPoolMatches([
      row('l2', { location: 'Bengaluru, India', acquired: { level: 2, label: 'relaxed' }, score: 90 }),
      row('l1', { location: 'Bengaluru, India', acquired: { level: 1, label: 'full match' }, score: 10 }),
    ], plan)
    expect(out.map((m) => m.name)).toEqual(['l1', 'l2'])
    expect(out.every((m) => m.outside_plan === null)).toBe(true)
  })
  it('does not mutate the input', () => {
    const input = [row('a', { score: 1 }), row('b', { score: 2 })]
    rankPoolMatches(input, plan)
    expect(input.map((m) => m.name)).toEqual(['a', 'b'])
    expect('outside_plan' in input[0]).toBe(false)
  })
})
