import { describe, it, expect } from 'vitest'
import { effectiveJobIds, combineFilterSets } from '../candidate-filter'

describe('effectiveJobIds', () => {
  it('intersects when both department jobs and selected jobs are given', () => {
    expect(effectiveJobIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c'])
  })
  it('returns department jobs when only those are given', () => {
    expect(effectiveJobIds(['a', 'b'], null)).toEqual(['a', 'b'])
  })
  it('returns selected jobs when only those are given', () => {
    expect(effectiveJobIds(null, ['x'])).toEqual(['x'])
  })
  it('returns null when neither constrains jobs', () => {
    expect(effectiveJobIds(null, null)).toBeNull()
  })
  it('can intersect to empty (contradiction)', () => {
    expect(effectiveJobIds(['a'], ['b'])).toEqual([])
  })
})

describe('combineFilterSets', () => {
  const S = (...ids: string[]) => new Set(ids)

  it('ANDs application and tag sets', () => {
    expect(combineFilterSets({ applicationSet: S('a', 'b', 'c'), tagSet: S('b', 'c', 'd'), excludeSet: S() }).sort())
      .toEqual(['b', 'c'])
  })
  it('uses the application set alone when no tag filter', () => {
    expect(combineFilterSets({ applicationSet: S('a', 'b'), tagSet: null, excludeSet: S() }).sort())
      .toEqual(['a', 'b'])
  })
  it('uses the tag set alone when no application filter', () => {
    expect(combineFilterSets({ applicationSet: null, tagSet: S('x'), excludeSet: S() })).toEqual(['x'])
  })
  it('removes excluded candidates', () => {
    expect(combineFilterSets({ applicationSet: S('a', 'b', 'c'), tagSet: null, excludeSet: S('b') }).sort())
      .toEqual(['a', 'c'])
  })
  it('returns [] when neither group filtered', () => {
    expect(combineFilterSets({ applicationSet: null, tagSet: null, excludeSet: S() })).toEqual([])
  })
})
