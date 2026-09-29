import { describe, it, expect } from 'vitest'
import { specificTitles, isGenericTitleTerm, poolKind } from './bets'

describe('specificTitles — level words alone at finance firms', () => {
  const ib = { label: 'The IB/VC Analyst Seeking Alpha', companies: ['Goldman Sachs', 'Morgan Stanley', 'Sequoia Capital', 'Accel'] }

  it('turns "Analyst · Associate" into the work they mean, keeping the bare words', () => {
    expect(specificTitles(['Analyst', 'Associate'], ib)).toEqual([
      'Investment Banking Analyst', 'Investment Banking Associate', 'Private Equity Analyst', 'Private Equity Associate',
      'Venture Capital Analyst', 'Venture Capital Associate', 'Investment Analyst', 'Investment Associate', 'Analyst', 'Associate',
    ])
  })

  it('leaves real titles, non-finance bets and already-fixed bets alone', () => {
    expect(specificTitles(['Investment Banking Analyst', 'Associate'], ib)).toBeNull()
    expect(specificTitles(['Business Analyst', 'Associate', 'Consultant'], { label: 'Consulting', companies: ['McKinsey'] })).toBeNull()
    expect(specificTitles(['Associate', 'Consultant'], { label: 'Consulting', companies: ['McKinsey', 'Bain'] })).toBeNull()
    expect(specificTitles(['Manager'], { label: 'Startup BizOps', companies: ['Swiggy'] })).toBeNull()
    expect(specificTitles([], ib)).toBeNull()
    expect(specificTitles(['Partner'], ib)).toBeNull()
  })

  it('still knows level words and pool kinds', () => {
    expect(isGenericTitleTerm('Associate')).toBe(true)
    expect(isGenericTitleTerm('Investment Associate')).toBe(false)
    expect(poolKind(ib)).toBe('finance')
    expect(poolKind({ label: 'MBB', companies: ['McKinsey'] })).toBe('consulting')
  })
})
