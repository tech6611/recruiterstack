import { describe, it, expect } from 'vitest'
import { groupEmployerAliases } from './employer-aliases'

describe('groupEmployerAliases', () => {
  it('shows a firm once, with its short name', () => {
    expect(groupEmployerAliases(['McKinsey', 'Bain', 'Boston Consulting Group', 'BCG']).map((g) => g.display))
      .toEqual(['McKinsey', 'Bain', 'Boston Consulting Group (BCG)'])
  })
  it('keeps both search terms behind the one chip', () => {
    expect(groupEmployerAliases(['Boston Consulting Group', 'BCG'])[0].members).toEqual(['Boston Consulting Group', 'BCG'])
  })
  it('works whichever name comes first, and ignores small words', () => {
    expect(groupEmployerAliases(['BCG', 'Boston Consulting Group']).map((g) => g.display)).toEqual(['Boston Consulting Group (BCG)'])
    expect(groupEmployerAliases(['Bank of America', 'BA']).map((g) => g.display)).toEqual(['Bank of America (BA)'])
  })
  it('leaves an acronym alone when no name matches it', () => {
    expect(groupEmployerAliases(['IBM', 'Google']).map((g) => g.display)).toEqual(['IBM', 'Google'])
  })
})
