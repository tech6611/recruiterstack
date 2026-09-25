import { describe, it, expect } from 'vitest'
import { experienceBandGate, experienceBandFromGate, yearsFloorFromLabel, isSourcingOnlyCriterion, mustHaveFromCriterion } from './icp-gates'

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
