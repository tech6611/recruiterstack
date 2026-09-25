import { describe, it, expect } from 'vitest'
import { planReach, applyMove, runAdaptivePlan, type AdaptiveMove } from './adaptive-plan'
import type { SearchSpec } from '@/lib/types/search-spec'

const spec: SearchSpec = {
  version: 1,
  base: [],
  levels: [
    {
      id: 'L1',
      label: 'Ideal · Rippling',
      criteria: [
        { id: 'ip-location', kind: 'location', values: ['San Francisco'], radius_km: 50 },
        { id: 'ip-titles', kind: 'title_current', values: ['Engineering Manager'] },
        { id: 'ip-companies', kind: 'employer_current', values: ['Rippling'] },
      ],
      relaxes: null,
    },
  ],
  post_fetch: [],
  source: 'brief',
}

const moreCompanies: AdaptiveMove = { kind: 'more_companies', label: 'more', companies: ['Deel'], titles: [], rationale: 'r' }
const probe3 = async (s: SearchSpec) => s.levels.map((l) => ({ key: l.id, label: l.label, total: 3 }))

describe('planReach', () => {
  it('sums level totals, treating null as 0', () => {
    expect(planReach([{ key: 'a', total: 3 }, { key: 'b', total: null }, { key: 'c', total: 5 }])).toBe(8)
  })
})

describe('applyMove', () => {
  it('more_companies: appends an employer level, keeping the ideal title + location', () => {
    const lvl = applyMove(spec, { kind: 'more_companies', label: 'Peers', companies: ['Deel', 'Ramp'], rationale: 'r' }, 0).levels[1]
    expect(lvl.label).toBe('Peers')
    expect(lvl.criteria.find((c) => c.kind === 'employer_current')?.values).toEqual(['Deel', 'Ramp'])
    expect(lvl.criteria.some((c) => c.kind === 'location')).toBe(true)
    expect(lvl.criteria.some((c) => c.kind === 'title_current')).toBe(true)
  })
  it('feeder_titles: applies the titles across the companies already in the plan', () => {
    const lvl = applyMove(spec, { kind: 'feeder_titles', label: 'Feeders', titles: ['Staff Engineer'], rationale: 'r' }, 0).levels[1]
    expect(lvl.criteria.find((c) => c.kind === 'title_current')?.values).toEqual(['Staff Engineer'])
    expect(lvl.criteria.find((c) => c.kind === 'employer_current')?.values).toEqual(['Rippling'])
  })
  it('wider_location: triples the radius', () => {
    const lvl = applyMove(spec, { kind: 'wider_location', label: 'Wider', rationale: 'r' }, 0).levels[1]
    expect(lvl.criteria.find((c) => c.kind === 'location')?.radius_km).toBe(150)
  })
  it('an empty move is a no-op (returns the same spec)', () => {
    expect(applyMove(spec, { kind: 'more_companies', label: 'x', companies: [], rationale: 'r' }, 0)).toBe(spec)
  })
})

describe('runAdaptivePlan', () => {
  it('does not expand when the first probe already meets the target', async () => {
    const r = await runAdaptivePlan({ spec, target: 3, probe: probe3, nextMove: async () => moreCompanies })
    expect(r.met).toBe(true)
    expect(r.spec.levels).toHaveLength(1)
    expect(r.steps).toHaveLength(1)
  })
  it('expands, re-probing, until the target is met', async () => {
    const r = await runAdaptivePlan({ spec, target: 8, probe: probe3, nextMove: async () => moreCompanies })
    expect(r.reach).toBe(9) // 3 → +1 level → 6 → +1 level → 9
    expect(r.met).toBe(true)
    expect(r.spec.levels).toHaveLength(3)
    expect(r.steps).toHaveLength(3)
  })
  it('stops when the brain has no next move', async () => {
    const r = await runAdaptivePlan({ spec, target: 100, probe: probe3, nextMove: async () => null })
    expect(r.met).toBe(false)
    expect(r.spec.levels).toHaveLength(1)
    expect(r.capped).toBe(false)
  })
  it('caps expansions and surfaces it (never a silent cap)', async () => {
    const r = await runAdaptivePlan({ spec, target: 1000, probe: probe3, nextMove: async () => moreCompanies, maxExpansions: 3 })
    expect(r.capped).toBe(true)
    expect(r.spec.levels).toHaveLength(4) // 1 initial + 3 added
  })
})
