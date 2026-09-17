import { describe, it, expect } from 'vitest'
import { evaluateGates, combineFit, gatingMustHaves } from './fit-engine'
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

describe('gatingMustHaves', () => {
  it('strips location and seniority so they can never reject, keeps real deal-breakers', () => {
    const gates = [
      gate({ id: 'a', attribute: 'location', value: 'Bengaluru' }),
      gate({ id: 'b', attribute: 'seniority', value: 'Senior' }),
      gate({ id: 'c', attribute: 'background', value: 'software engineering' }),
      gate({ id: 'd', attribute: 'min_experience', value: '5' }),
    ]
    expect(gatingMustHaves(gates).map((g) => g.id)).toEqual(['c', 'd'])
    expect(gatingMustHaves(undefined)).toEqual([])
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

  it('REJECTS on a deal-breaker failure, even with a perfect competency score', () => {
    // A failed must-have floors the score into the reject band and forces weak/no.
    const r = combineFit([{ rating: 4, weight: 100 }], [gate({})])
    expect(r.passed_gates).toBe(false)
    expect(r.fit_bucket).toBe('weak')
    expect(r.recommendation).toBe('no')
    expect(r.score).toBeLessThan(40)
  })

  it('recommends no when a gate fails and the score is weak', () => {
    expect(combineFit([{ rating: 1, weight: 100 }], [gate({})]).recommendation).toBe('no')
  })
})

// ── UNKNOWN gate verdicts (Step 2: thin vendor profiles) ────────────────────────
import { icpFitResponseSchema } from './schemas'

describe('icpFitResponseSchema gate_results', () => {
  it('accepts null as an UNKNOWN verdict and keeps true/false intact', () => {
    const parsed = icpFitResponseSchema.parse({
      competencies: [],
      gate_results: [{ id: 'a', pass: true, reason: '' }, { id: 'b', pass: false, reason: 'no' }, { id: 'c', pass: null, reason: 'no skills listed' }],
      red_flags: [], strengths: [], gaps: [], rationale: '',
    })
    expect(parsed.gate_results.map((g) => g.pass)).toEqual([true, false, null])
  })
  it('never turns a malformed verdict into a rejection', () => {
    const parsed = icpFitResponseSchema.parse({
      competencies: [], gate_results: [{ id: 'a', pass: 'maybe', reason: '' }], red_flags: [], strengths: [], gaps: [], rationale: '',
    })
    expect(parsed.gate_results[0].pass).toBe(true)
  })
})

// ── Experience band: the ceiling rejects deterministically ──────────────────────
describe('evaluateGates (experience_band)', () => {
  const band: IcpMustHave = { id: 'g-band', label: 'between 2 and 6 years', attribute: 'experience_band', operator: 'between', value: ['2', '6'] }
  const cand = (experience_years: number | null) => ({ name: 'x', skills: [], experience_years } as unknown as Candidate)
  it('fails a CLEAR breach (12-year partner, 0.5-year graduate), passes in-band and marginal, never fails on unknown years', () => {
    expect(evaluateGates(cand(12), [band]).map((g) => g.id)).toEqual(['g-band'])
    expect(evaluateGates(cand(0.5), [band]).map((g) => g.id)).toEqual(['g-band'])
    expect(evaluateGates(cand(4), [band])).toEqual([])
    // Within tolerance (max 6 → 7.5): derived years can over-count internships/overlaps; the judge decides.
    expect(evaluateGates(cand(7.2), [band])).toEqual([])
    expect(evaluateGates(cand(null), [band])).toEqual([])
  })
})
