import { describe, it, expect } from 'vitest'
import { normalizePersonName } from '../people'

describe('normalizePersonName', () => {
  it('title-cases an all-caps name', () => {
    expect(normalizePersonName('SAGAR')).toBe('Sagar')
    expect(normalizePersonName('SAGAR KUMAR')).toBe('Sagar Kumar')
  })

  it('title-cases an all-lowercase name', () => {
    expect(normalizePersonName('sagar kumar')).toBe('Sagar Kumar')
  })

  it('leaves an already mixed-case name untouched', () => {
    expect(normalizePersonName('Sagar Kumar')).toBe('Sagar Kumar')
    expect(normalizePersonName('McDonald')).toBe('McDonald')
    expect(normalizePersonName('DeShawn')).toBe('DeShawn')
  })

  it('capitalises across hyphens and apostrophes', () => {
    expect(normalizePersonName('MARY-JANE')).toBe('Mary-Jane')
    expect(normalizePersonName("o'brien")).toBe("O'Brien")
    expect(normalizePersonName('mary-jane o’neil')).toBe('Mary-Jane O’Neil')
  })

  it('collapses stray whitespace and trims', () => {
    expect(normalizePersonName('  sagar   kumar  ')).toBe('Sagar Kumar')
  })

  it('returns empty/blank input unchanged', () => {
    expect(normalizePersonName('')).toBe('')
    expect(normalizePersonName('   ')).toBe('')
  })
})
