import { describe, it, expect } from 'vitest'
import { experienceBandGate, experienceBandFromGate, yearsFloorFromLabel } from './icp-gates'

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
