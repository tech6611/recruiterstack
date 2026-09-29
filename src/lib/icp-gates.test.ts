import { describe, it, expect } from 'vitest'
import { experienceBandGate, experienceBandFromGate, yearsFloorFromLabel, isSourcingOnlyCriterion, mustHaveFromCriterion, criterionLabel } from './icp-gates'
import { icpDraftInputSchema } from '@/lib/validations/icp'

describe('experience band gate', () => {
  it('round-trips a [min, max] band through the structured gate', () => {
    const g = experienceBandGate(2, 6)!
    expect(g.attribute).toBe('experience_band')
    expect(g.label).toContain('between 2 and 6 years')
    expect(experienceBandFromGate(g)).toEqual({ min: 2, max: 6 })
  })
  it('handles one-sided bands and ignores other gates', () => {
    expect(experienceBandFromGate(experienceBandGate(null, 8)!)).toEqual({ min: null, max: 8 })
    expect(experienceBandFromGate(experienceBandGate(3, null)!)).toEqual({ min: 3, max: null })
    expect(experienceBandGate(null, null)).toBeNull()
    expect(experienceBandFromGate({ attribute: 'skill', value: 'SQL' })).toBeNull()
  })
  it('yearsFloorFromLabel reads plain gates', () => {
    expect(yearsFloorFromLabel('at least 2 full years?')).toBe(2)
    expect(yearsFloorFromLabel('mentions SQL')).toBeNull()
  })
})

describe('sourcing-only vs hard gate', () => {
  it('a relaxable employer or positive-title row is a search lane, never a gate', () => {
    expect(isSourcingOnlyCriterion({ kind: 'employer_current', relax_at: 2, enforcement: undefined })).toBe(true)
    expect(isSourcingOnlyCriterion({ kind: 'title_current', relax_at: 3, enforcement: undefined })).toBe(true)
    expect(isSourcingOnlyCriterion({ kind: 'title_any', relax_at: 3, enforcement: undefined })).toBe(true)
  })
  it('an exclusion title (no relax_at) stays a hard gate', () => {
    expect(isSourcingOnlyCriterion({ kind: 'title_current', relax_at: null, enforcement: undefined })).toBe(false)
  })
  it('never-relaxed gates (years, function, location, education) stay hard', () => {
    expect(isSourcingOnlyCriterion({ kind: 'years_band', relax_at: null, enforcement: undefined })).toBe(false)
    expect(isSourcingOnlyCriterion({ kind: 'function', relax_at: null, enforcement: undefined })).toBe(false)
  })
  it('an explicit enforcement value always wins over the fallback', () => {
    expect(isSourcingOnlyCriterion({ kind: 'years_band', relax_at: null, enforcement: 'sourcing_only' })).toBe(true)
    expect(isSourcingOnlyCriterion({ kind: 'employer_current', relax_at: 2, enforcement: 'hard' })).toBe(false)
  })
  it('mustHaveFromCriterion tags relaxable employer/title rows as sourcing_only', () => {
    expect(mustHaveFromCriterion({ id: 'e', kind: 'employer_current', values: ['Ramp'], relax_at: 2 }).enforcement).toBe('sourcing_only')
    expect(mustHaveFromCriterion({ id: 't', kind: 'title_current', values: ['Engineering Manager'], relax_at: 3 }).enforcement).toBe('sourcing_only')
    expect(mustHaveFromCriterion({ id: 'x', kind: 'title_current', values: ['TPM'], exclude: true }).enforcement).toBe('hard')
    expect(mustHaveFromCriterion({ id: 'y', kind: 'years_band', values: [], min: 6, max: 12 }).enforcement).toBe('hard')
  })
})

describe('automatic labels always fit the save limit', () => {
  // A School row with the house tier-1 list made a 329-character label and the whole
  // profile was refused on Re-approve with "Validation failed".
  const schools = ['Indian Institute of Technology', 'IIT', 'Indian Institute of Management', 'IIM', 'Indian School of Business', 'ISB', 'BITS Pilani', 'Birla Institute of Technology and Science', 'National Institute of Technology', 'NIT', 'Shri Ram College of Commerce', 'SRCC', "St. Stephen's College", 'Faculty of Management Studies', 'FMS', 'XLRI']

  it('lists what fits, then says how many more', () => {
    const label = criterionLabel({ kind: 'school', values: schools })
    expect(label.length).toBeLessThanOrEqual(200)
    expect(label).toMatch(/^School: Indian Institute of Technology \/ IIT \/ .* \+\d+ more$/)
    // The row keeps every value; only the phrase is short.
    expect(mustHaveFromCriterion({ id: 'ip-school', kind: 'school', values: schools, relax_at: 3 }).values).toHaveLength(16)
  })

  it('a row built that way passes the save check', () => {
    const row = mustHaveFromCriterion({ id: 'ip-school', kind: 'school', values: schools, relax_at: 3 })
    expect(icpDraftInputSchema.safeParse({ must_haves: [row], competencies: [] }).success).toBe(true)
  })

  it('leaves a short list whole', () => {
    expect(criterionLabel({ kind: 'school', values: ['IIM', 'IIT'] })).toBe('School: IIM / IIT')
  })
})

import { isBetOverride, jobWideMustHaves, betProfile, betOverrideId, overrideBaseId, saveBetRow, removeBetRow } from './icp-gates'
import { gatingMustHaves } from '@/lib/ai/fit-engine'
import type { SearchCriterion } from '@/lib/types/search-spec'

describe('bet overrides — one bet\'s own location / years / school', () => {
  const shared: SearchCriterion[] = [
    { id: 'ip-location', kind: 'location', values: ['Bengaluru'], radius_km: 50, relax_at: 4 },
    { id: 'ip-years', kind: 'years_band', values: [], min: 2, max: 6, relax_at: null },
    { id: 'ip-school', kind: 'school', values: ['IIT'], relax_at: 3 },
  ]
  const bet3 = [
    { id: 'ip-bet-3-companies', kind: 'employer_current', values: ['Goldman Sachs'], relax_at: 2, bet: 3, bet_label: 'IB' },
    { id: 'ip-bet-3-titles', kind: 'title_current', values: ['Analyst'], relax_at: 3, bet: 3, bet_label: 'IB' },
  ] as SearchCriterion[]
  const yrs3: SearchCriterion = { id: betOverrideId('ip-years', 3), kind: 'years_band', values: [], min: 2, max: 4, relax_at: null, bet: 3, bet_label: 'IB' }
  const gmat3: SearchCriterion = { id: betOverrideId('mh-x', 3), kind: 'skill', values: ['Excel'], relax_at: null, bet: 3, bet_label: 'IB' }
  const all = [...shared, ...bet3, yrs3, gmat3]

  it('a bet\'s companies and titles are not overrides; its own years are', () => {
    expect(bet3.map(isBetOverride)).toEqual([false, false])
    expect(isBetOverride(yrs3)).toBe(true)
    expect(shared.some(isBetOverride)).toBe(false)
    expect(overrideBaseId(yrs3.id)).toBe('ip-years')
  })

  it('each bet sees the shared rows, replaced by its own where it has one', () => {
    expect(betProfile(all, 3).map((c) => c.id)).toEqual(['ip-location', yrs3.id, 'ip-school', gmat3.id])
    expect(betProfile(all, 1).map((c) => c.id)).toEqual(['ip-location', 'ip-years', 'ip-school'])
  })

  it('an override never rejects anyone and is invisible outside the editor', () => {
    const gates = all.map((c) => mustHaveFromCriterion(c))
    const override = gates.find((g) => g.id === yrs3.id)!
    expect(override.enforcement).toBe('sourcing_only')
    expect(gatingMustHaves(gates).map((g) => g.id)).not.toContain(yrs3.id)
    expect(gatingMustHaves(gates).map((g) => g.id)).toContain('ip-years')
    expect(jobWideMustHaves(gates).map((g) => g.id)).toEqual(['ip-location', 'ip-years', 'ip-school', 'ip-bet-3-companies', 'ip-bet-3-titles'])
    // Even without a stored enforcement (an older writer), it is still not a gate.
    expect(isSourcingOnlyCriterion({ ...override, enforcement: undefined })).toBe(true)
  })

  it('editing under a bet: only this bet makes an override; every bet rewrites the shared row', () => {
    const gates = [...shared, ...bet3].map((c) => mustHaveFromCriterion(c))
    const mine = saveBetRow(gates, 3, 'IB', { ...shared[1], min: 2, max: 4 }, false)
    expect(mine.find((g) => g.id === 'ip-years')!.max).toBe(6)
    expect(mine.find((g) => g.id === betOverrideId('ip-years', 3))).toMatchObject({ bet: 3, max: 4, enforcement: 'sourcing_only' })
    // Editing the override again updates it in place.
    const again = saveBetRow(mine, 3, 'IB', { ...yrs3, max: 5 }, false)
    expect(again.filter((g) => g.id === yrs3.id)).toHaveLength(1)
    expect(again.find((g) => g.id === yrs3.id)!.max).toBe(5)
    // Set back to the shared value → the override goes away.
    expect(saveBetRow(mine, 3, 'IB', { ...yrs3, max: 6 }, false).some((g) => g.id === yrs3.id)).toBe(false)
    // Every bet: the shared row changes and every bet's own version is dropped.
    const everyone = saveBetRow(mine, 3, 'IB', { ...yrs3, min: 3, max: 8 }, true)
    expect(everyone.find((g) => g.id === 'ip-years')).toMatchObject({ min: 3, max: 8, enforcement: 'hard' })
    expect(everyone.find((g) => g.id === 'ip-years')!.bet).toBeUndefined()
    expect(everyone.some(isBetOverride)).toBe(false)
  })

  it('removing under a bet: an override goes back to shared; a shared row leaves every bet', () => {
    const gates = all.map((c) => mustHaveFromCriterion(c))
    expect(removeBetRow(gates, yrs3).map((g) => g.id)).not.toContain(yrs3.id)
    expect(removeBetRow(gates, yrs3).map((g) => g.id)).toContain('ip-years')
    const gone = removeBetRow(gates, shared[1])
    expect(gone.some((g) => overrideBaseId(g.id) === 'ip-years')).toBe(false)
    expect(gone.map((g) => g.id)).toContain(gmat3.id)
  })

  it('a profile with overrides still saves (up to 40 rows)', () => {
    const many = Array.from({ length: 30 }, (_, i) => mustHaveFromCriterion({ id: `mh-${i}`, kind: 'skill', values: ['x'], relax_at: null }))
    expect(icpDraftInputSchema.safeParse({ must_haves: many, competencies: [] }).success).toBe(true)
  })
})
