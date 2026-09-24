import { describe, it, expect } from 'vitest'
import { summarizeLabelCounts } from './pool'

describe('summarizeLabelCounts', () => {
  it('counts by value and orders by frequency', () => {
    const out = summarizeLabelCounts(['Stripe', 'Notion', 'Stripe', 'Stripe', 'Notion'], 10)
    expect(out).toEqual([
      { name: 'Stripe', count: 3 },
      { name: 'Notion', count: 2 },
    ])
  })

  it('groups case-insensitively but keeps the first-seen spelling', () => {
    const out = summarizeLabelCounts(['Stripe', 'stripe', 'STRIPE'], 10)
    expect(out).toEqual([{ name: 'Stripe', count: 3 }])
  })

  it('trims whitespace and ignores empty / null / undefined labels', () => {
    const out = summarizeLabelCounts(['  Ramp  ', '', null, undefined, '   ', 'Ramp'], 10)
    expect(out).toEqual([{ name: 'Ramp', count: 2 }])
  })

  it('breaks ties alphabetically for a stable order', () => {
    const out = summarizeLabelCounts(['Rippling', 'Clay'], 10)
    expect(out).toEqual([
      { name: 'Clay', count: 1 },
      { name: 'Rippling', count: 1 },
    ])
  })

  it('caps the result at topN', () => {
    const out = summarizeLabelCounts(['a', 'b', 'c', 'd'], 2)
    expect(out).toHaveLength(2)
  })

  it('returns an empty array when there is nothing to count', () => {
    expect(summarizeLabelCounts([], 10)).toEqual([])
    expect(summarizeLabelCounts([null, '', '  '], 10)).toEqual([])
  })
})
