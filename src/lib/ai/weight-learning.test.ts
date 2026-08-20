import { describe, it, expect } from 'vitest'
import { computeWeightSignal } from './weight-learning'

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
})
