import { describe, it, expect } from 'vitest'
import { isGenericTitleTerm } from './bets'

describe('level words', () => {
  it('a level word alone is not a searchable title, in any industry', () => {
    expect(isGenericTitleTerm('Associate')).toBe(true)
    expect(isGenericTitleTerm('Senior')).toBe(true)
    expect(isGenericTitleTerm('Investment Associate')).toBe(false)
    expect(isGenericTitleTerm('Charge Nurse')).toBe(false)
  })
})
