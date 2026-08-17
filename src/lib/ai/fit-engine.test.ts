import { describe, it, expect } from 'vitest'
import { evaluateGates, combineFit } from './fit-engine'
import type { Candidate } from '@/lib/types/database'
import type { IcpMustHave } from '@/lib/types/icp'

function candidate(overrides: Record<string, unknown>): Candidate {
  return { name: 'X', location: null, experience_years: null, skills: [], ...overrides } as unknown as Candidate
}
const gate = (o: Partial<IcpMustHave>): IcpMustHave =>
  ({ id: 'g', label: 'g', attribute: 'skill', operator: 'includes', value: '', ...o })

describe('evaluateGates', () => {
  it('fails a location gate on mismatch, passes on match, skips when unknown', () => {
    const g = gate({ attribute: 'location', operator: 'equals', value: 'Bengaluru' })
    expect(evaluateGates(candidate({ location: 'Mumbai' }), [g])).toHaveLength(1)
    expect(evaluateGates(candidate({ location: 'Bengaluru, India' }), [g])).toHaveLength(0) // substring match
    expect(evaluateGates(candidate({ location: null }), [g])).toHaveLength(0) // not evaluable → not a fail
  })

  it('fails min-experience below the threshold, parsing "5+ years"', () => {
    const g = gate({ attribute: 'min_experience', operator: 'gte', value: '5+ years' })
    expect(evaluateGates(candidate({ experience_years: 3 }), [g])).toHaveLength(1)
    expect(evaluateGates(candidate({ experience_years: 6 }), [g])).toHaveLength(0)
    expect(evaluateGates(candidate({ experience_years: null }), [g])).toHaveLength(0)
  })

  it('fails a skill gate only when skills are present and none match', () => {
    const g = gate({ attribute: 'skill', value: 'SQL' })
    expect(evaluateGates(candidate({ skills: ['python', 'excel'] }), [g])).toHaveLength(1)
    expect(evaluateGates(candidate({ skills: ['Advanced SQL', 'python'] }), [g])).toHaveLength(0)
    expect(evaluateGates(candidate({ skills: [] }), [g])).toHaveLength(0) // unknown skills → not a fail
  })

  it('never fails a gate it cannot evaluate (e.g. seniority)', () => {
    const g = gate({ attribute: 'seniority', operator: 'equals', value: 'Senior' })
    expect(evaluateGates(candidate({ current_title: 'Junior Analyst' } as Partial<Candidate>), [g])).toHaveLength(0)
  })
})

describe('combineFit', () => {
  const noGates: IcpMustHave[] = []

  it('maps all-4 ratings to 100 (great / strong_yes)', () => {
    const r = combineFit([{ rating: 4, weight: 50 }, { rating: 4, weight: 50 }], noGates)
    expect(r).toMatchObject({ score: 100, fit_bucket: 'great', recommendation: 'strong_yes', passed_gates: true })
  })

  it('maps all-1 ratings to 0 → WEAK / no (a 0 must not read as an OK fit)', () => {
    const r = combineFit([{ rating: 1, weight: 100 }], noGates)
    expect(r).toMatchObject({ score: 0, fit_bucket: 'weak', recommendation: 'no' })
  })

  it('bands: >=40 okay, <40 weak', () => {
    // rating 2 across the board → (2-1)/3 = 33 → weak
    expect(combineFit([{ rating: 2, weight: 100 }], noGates).fit_bucket).toBe('weak')
    // rating ~2.2 needed for 40; use mixed to land >=40 → okay
    expect(combineFit([{ rating: 3, weight: 60 }, { rating: 1, weight: 40 }], noGates).fit_bucket).toBe('okay')
  })

  it('computes a weighted middle score', () => {
    expect(combineFit([{ rating: 3, weight: 100 }], noGates).score).toBe(67)
  })

  it('normalises when weights do not sum to 100', () => {
    expect(combineFit([{ rating: 4, weight: 20 }, { rating: 4, weight: 20 }], noGates).score).toBe(100)
  })

  it('caps the bucket to okay on a gate failure, even with a perfect score', () => {
    const r = combineFit([{ rating: 4, weight: 100 }], [gate({})])
    expect(r).toMatchObject({ score: 100, fit_bucket: 'okay', passed_gates: false, recommendation: 'maybe' })
  })

  it('recommends no when a gate fails and the score is weak', () => {
    expect(combineFit([{ rating: 1, weight: 100 }], [gate({})]).recommendation).toBe('no')
  })
})
