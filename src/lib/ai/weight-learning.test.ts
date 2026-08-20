import { describe, it, expect } from 'vitest'
import { computeWeightSignal, detectStructuralGaps, type GapRow } from './weight-learning'

// Two competencies at 50/50. "signal" cleanly separates Yes (rating 4) from No (rating 1);
// "noise" is ~2.5 for everyone. The learner should shift weight toward "signal".
function labels(n: number) {
  const out = []
  for (let i = 0; i < n; i++) {
    const yes = i % 2 === 0
    out.push({
      decision: (yes ? 'yes' : 'no') as 'yes' | 'no',
      competencies: [
        { name: 'signal', rating: yes ? 4 : 1 },
        { name: 'noise', rating: i % 3 === 0 ? 2 : 3 },
      ],
    })
  }
  return out
}
const comps = [
  { id: 'signal', name: 'signal', weight: 50 },
  { id: 'noise', name: 'noise', weight: 50 },
]

describe('computeWeightSignal', () => {
  it('says insufficient below the decision threshold and leaves weights unchanged', () => {
    const r = computeWeightSignal(labels(4), comps)
    expect(r.sufficient).toBe(false)
    expect(r.competencies.map((c) => c.suggested_weight)).toEqual([50, 50])
  })

  it('shifts weight toward the competency that separates Yes from No', () => {
    const r = computeWeightSignal(labels(20), comps)
    expect(r.sufficient).toBe(true)
    const signal = r.competencies.find((c) => c.name === 'signal')!
    const noise = r.competencies.find((c) => c.name === 'noise')!
    expect(signal.separation).toBeCloseTo(1, 5)      // (4-1)/3
    expect(Math.abs(noise.separation!)).toBeLessThan(0.2)
    expect(signal.suggested_weight).toBeGreaterThan(signal.current_weight)
    expect(noise.suggested_weight).toBeLessThan(noise.current_weight)
    expect(signal.suggested_weight + noise.suggested_weight).toBe(100)
  })

  it('grows confidence with more decisions (moves further from the prior)', () => {
    const few = computeWeightSignal(labels(12), comps).competencies.find((c) => c.name === 'signal')!.suggested_weight
    const many = computeWeightSignal(labels(60), comps).competencies.find((c) => c.name === 'signal')!.suggested_weight
    expect(many).toBeGreaterThan(few)
  })

  it('excludes maybe decisions from the signal', () => {
    const withMaybes = [
      ...labels(10),
      { decision: 'maybe' as const, competencies: [{ name: 'signal', rating: 1 }, { name: 'noise', rating: 4 }] },
    ]
    const r = computeWeightSignal(withMaybes, comps)
    expect(r.decided).toBe(10) // the maybe is not counted
  })

  it('pools borrowed (down-weighted) labels but trusts them less than own decisions', () => {
    // Only 3 own decisions (insufficient) + 20 borrowed at weight 0.5 → effective 3+10.
    const own = labels(3)
    const borrowed = labels(20).map((l) => ({ ...l, weight: 0.5 }))
    const r = computeWeightSignal([...own, ...borrowed], comps)
    expect(r.sufficient).toBe(true) // effectiveN (13) crosses the threshold
    expect(r.confidence).toBeLessThan(0.6) // but confidence is modest, not as if 23 own
  })
})

describe('detectStructuralGaps', () => {
  const row = (decision: 'yes' | 'no', icp_positive: boolean, passed_gates = true): GapRow => ({ decision, icp_positive, passed_gates })

  it('flags a missing disqualifier when the recruiter keeps rejecting ICP-loved candidates', () => {
    const rows: GapRow[] = [
      ...Array(6).fill(null).map(() => row('no', true)),   // rejected despite ICP fit + gates passed
      ...Array(3).fill(null).map(() => row('yes', true)),
    ]
    const d = detectStructuralGaps(rows)
    expect(d.reject_despite_positive).toBe(6)
    expect(d.missing_disqualifier).toBe(true)
    expect(d.too_harsh).toBe(false)
  })

  it('flags too-harsh when the recruiter keeps accepting ICP-rejected candidates', () => {
    const rows: GapRow[] = [
      ...Array(5).fill(null).map(() => row('yes', false)), // accepted despite ICP negative
      ...Array(4).fill(null).map(() => row('no', false)),
    ]
    const d = detectStructuralGaps(rows)
    expect(d.accept_despite_negative).toBe(5)
    expect(d.too_harsh).toBe(true)
    expect(d.missing_disqualifier).toBe(false)
  })

  it('stays quiet when the ICP and recruiter mostly agree', () => {
    const rows: GapRow[] = [
      ...Array(8).fill(null).map(() => row('yes', true)),
      ...Array(8).fill(null).map(() => row('no', false)),
    ]
    const d = detectStructuralGaps(rows)
    expect(d.missing_disqualifier).toBe(false)
    expect(d.too_harsh).toBe(false)
  })
})
