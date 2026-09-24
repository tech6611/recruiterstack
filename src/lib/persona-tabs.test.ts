import { describe, it, expect } from 'vitest'
import { buildPersonaTabs, type PersonaFacets } from './persona-tabs'
import type { SearchSpec } from '@/lib/types/search-spec'

const spec: SearchSpec = {
  version: 1,
  base: [
    { id: 'y', kind: 'years_band', values: [], min: 6, max: 12 },
    { id: 'loc', kind: 'location', values: ['New York'], radius_km: 50 },
  ],
  levels: [
    {
      id: 'L1',
      label: 'Ideal',
      criteria: [
        { id: 'e1', kind: 'employer_current', values: ['Stripe', 'Notion'] },
        { id: 't1', kind: 'title_current', values: ['Engineering Manager'] },
        { id: 's1', kind: 'seniority', values: ['Manager'] },
        { id: 'sk1', kind: 'skill', values: ['Python'] },
      ],
    },
    {
      id: 'L2',
      label: 'Peer companies',
      criteria: [{ id: 'e2', kind: 'employer_current', values: ['Ramp', 'Rippling'] }],
    },
  ],
  post_fetch: [],
  source: 'brief',
}

const facets: PersonaFacets = {
  companies: [{ name: 'Acme', count: 5 }, { name: 'Stripe', count: 3 }],
  titles: [{ name: 'Engineering Manager', count: 2 }],
  skills: ['Python', 'Go'],
  cities: ['New York', 'Boston'],
  total: 42,
}

const tabOf = (p: ReturnType<typeof buildPersonaTabs>, key: string) => p.tabs.find((t) => t.key === key)!

describe('buildPersonaTabs', () => {
  it('produces all six tabs in order', () => {
    const p = buildPersonaTabs(spec, facets)
    expect(p.tabs.map((t) => t.key)).toEqual(['employers', 'titles', 'skills', 'seniority', 'years', 'locations'])
    expect(p.hasPool).toBe(true)
    expect(p.poolTotal).toBe(42)
  })

  it('marks widened (L2+) employers as relaxed, keeps L1 as core', () => {
    const emp = tabOf(buildPersonaTabs(spec, facets), 'employers')
    const core = emp.ideal.filter((c) => !c.relaxed).map((c) => c.label)
    const widened = emp.ideal.filter((c) => c.relaxed).map((c) => c.label)
    expect(core).toEqual(['Stripe', 'Notion'])
    expect(widened).toEqual(['Ramp', 'Rippling'])
    expect(emp.summary).toBe('2 companies') // core only
  })

  it('attaches pool counts to targeted employers (case-insensitive)', () => {
    const emp = tabOf(buildPersonaTabs(spec, facets), 'employers')
    expect(emp.ideal.find((c) => c.label === 'Stripe')?.count).toBe(3)
    expect(emp.ideal.find((c) => c.label === 'Notion')?.count).toBeNull() // not in the pool
    // the market-map distribution is the full company facet list
    expect(emp.pool).toEqual([{ label: 'Acme', count: 5 }, { label: 'Stripe', count: 3 }])
  })

  it('renders years and location as readable bands', () => {
    const p = buildPersonaTabs(spec, facets)
    expect(tabOf(p, 'years').ideal[0].label).toBe('6–12 years')
    expect(tabOf(p, 'years').summary).toBe('6–12 years')
    expect(tabOf(p, 'locations').ideal[0].label).toBe('New York · 50 km')
    expect(tabOf(p, 'locations').pool.map((c) => c.label)).toEqual(['New York', 'Boston'])
  })

  it('surfaces seniority and skills', () => {
    const p = buildPersonaTabs(spec, facets)
    expect(tabOf(p, 'seniority').summary).toBe('Manager')
    expect(tabOf(p, 'skills').ideal.map((c) => c.label)).toEqual(['Python'])
    expect(tabOf(p, 'skills').pool.map((c) => c.label)).toEqual(['Python', 'Go'])
  })

  it('without facets: persona from the spec, no pool distribution', () => {
    const p = buildPersonaTabs(spec, null)
    expect(p.hasPool).toBe(false)
    expect(p.poolTotal).toBeNull()
    const emp = tabOf(p, 'employers')
    expect(emp.ideal.map((c) => c.label)).toEqual(['Stripe', 'Notion', 'Ramp', 'Rippling'])
    expect(emp.ideal.every((c) => c.count == null)).toBe(true)
    expect(emp.pool).toEqual([])
  })

  it('null spec → empty but well-formed tabs', () => {
    const p = buildPersonaTabs(null, null)
    expect(p.tabs).toHaveLength(6)
    expect(p.tabs.every((t) => t.ideal.length === 0 && t.pool.length === 0)).toBe(true)
    expect(p.tabs.every((t) => t.summary === '—')).toBe(true)
  })

  it('a value present at both L1 and L2 stays core (not relaxed)', () => {
    const s: SearchSpec = {
      ...spec,
      levels: [
        { id: 'L1', label: 'Ideal', criteria: [{ id: 'a', kind: 'employer_current', values: ['Stripe'] }] },
        { id: 'L2', label: 'Wider', criteria: [{ id: 'b', kind: 'employer_current', values: ['Stripe', 'Ramp'] }] },
      ],
    }
    const emp = tabOf(buildPersonaTabs(s, null), 'employers')
    expect(emp.ideal.find((c) => c.label === 'Stripe')?.relaxed).toBe(false)
    expect(emp.ideal.find((c) => c.label === 'Ramp')?.relaxed).toBe(true)
  })
})
