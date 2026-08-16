import { describe, it, expect } from 'vitest'
import { buildShortlist, shortlistCounts } from './shortlist-brief'
import type { PoolMatch } from '@/modules/pool/domain/pool-sourcing'

const poolA = [
  { candidate_id: 'c1', score: 88, fit_bucket: 'great', rationale: 'strong', gate_failures: [{ label: 'SQL' }], candidate: { name: 'Asha', current_title: 'EM', current_company: 'Acme', location: 'BLR' } },
  { candidate_id: 'c2', score: 60, fit_bucket: 'good', rationale: 'ok', gate_failures: [], candidate: { name: 'Ben', current_title: 'Lead' } },
]
const poolB: PoolMatch[] = [
  { profile_id: 'p1', name: 'Priyank', current_title: 'MD', current_company: 'Sahaj', location: 'BLR', reachable: true, score: 95, fit_bucket: 'great', rationale: 'exec', gate_failures: [] },
]

describe('buildShortlist', () => {
  it('merges both pools and ranks by score, tagging the source', () => {
    const s = buildShortlist(poolA, poolB)
    expect(s.map((i) => i.name)).toEqual(['Priyank', 'Asha', 'Ben']) // 95, 88, 60
    expect(s[0].source).toBe('market')
    expect(s[0].reachable).toBe(true)
    expect(s[1].source).toBe('yours')
    expect(s[1].company).toBe('Acme')
  })
  it('normalizes gate_failures from either shape to labels', () => {
    const s = buildShortlist(poolA, poolB)
    expect(s.find((i) => i.name === 'Asha')!.gate_failures).toEqual(['SQL'])
  })
  it('respects the limit', () => {
    expect(buildShortlist(poolA, poolB, 1)).toHaveLength(1)
  })
})

describe('shortlistCounts', () => {
  it('counts by source and bucket', () => {
    const c = shortlistCounts(buildShortlist(poolA, poolB))
    expect(c).toMatchObject({ total: 3, yours: 2, market: 1, great: 2, good: 1 })
  })
})
