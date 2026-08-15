import { describe, it, expect } from 'vitest'
import { summarizeFeedback, applyRefinement, type FeedbackLabel, type IcpRefinement } from './icp-feedback'
import type { Icp } from '@/lib/types/icp'

const label = (o: Partial<FeedbackLabel>): FeedbackLabel =>
  ({ decision: 'yes', bucket: 'good', score: 70, competencies: [], title: null, ...o })

describe('summarizeFeedback', () => {
  it('counts agreement, over-rating and under-rating from decisions vs ICP verdicts', () => {
    const s = summarizeFeedback([
      label({ decision: 'yes', bucket: 'great' }),   // agree
      label({ decision: 'yes', bucket: 'okay' }),    // ICP too harsh (underrated)
      label({ decision: 'no', bucket: 'good' }),     // ICP too generous (overrated)
      label({ decision: 'no', bucket: 'okay' }),     // agree
      label({ decision: 'maybe', bucket: 'good' }),  // neutral
    ])
    expect(s).toEqual({ decided: 5, agree: 2, overrated: 1, underrated: 1 })
  })

  it('falls back to the numeric score when no bucket is present', () => {
    const s = summarizeFeedback([
      label({ decision: 'yes', bucket: null, score: 40 }), // score < 60 → ICP negative → underrated
      label({ decision: 'no', bucket: null, score: 90 }),  // score >= 60 → ICP positive → overrated
    ])
    expect(s).toMatchObject({ underrated: 1, overrated: 1, agree: 0 })
  })
})

describe('applyRefinement', () => {
  const icp = {
    must_haves: [
      { id: 'loc', label: 'Based in Bengaluru', attribute: 'location', operator: 'equals', value: 'Bengaluru' },
      { id: 'g-ai-0', label: 'SQL', attribute: 'skill', operator: 'includes', value: 'SQL' },
    ],
    competencies: [
      { id: 'technical', name: 'Technical', weight: 50, behaviours: ['a'] },
      { id: 'culture', name: 'Culture', weight: 50, behaviours: [] },
    ],
  } as Pick<Icp, 'must_haves' | 'competencies'>

  const refinement = (o: Partial<IcpRefinement>): IcpRefinement =>
    ({ weight_changes: [], behaviours_add: [], gates_add: [], gates_remove: [], change_summary: '', ...o })

  it('applies weight changes and re-normalises to 100', () => {
    const out = applyRefinement(icp, refinement({ weight_changes: [{ id: 'technical', weight: 70 }] }))
    // 70 + 50 = 120 → normalise: 70/120≈58, 50/120≈42, drift fixed on first
    expect(out.competencies.reduce((s, c) => s + c.weight, 0)).toBe(100)
    expect(out.competencies.find((c) => c.id === 'technical')!.weight).toBeGreaterThan(
      out.competencies.find((c) => c.id === 'culture')!.weight,
    )
  })

  it('appends behaviours by competency id', () => {
    const out = applyRefinement(icp, refinement({ behaviours_add: [{ id: 'technical', behaviour: 'ships fast' }] }))
    expect(out.competencies.find((c) => c.id === 'technical')!.behaviours).toEqual(['a', 'ships fast'])
  })

  it('removes gates by id or label and adds new ones', () => {
    const out = applyRefinement(icp, refinement({
      gates_remove: ['SQL'], // by label
      gates_add: [{ label: '3+ years', attribute: 'min_experience', operator: 'gte', value: '3' }],
    }))
    expect(out.must_haves.map((g) => g.attribute)).toEqual(['location', 'min_experience'])
  })

  it('always tags the result as a refinement and keeps weights summing to 100', () => {
    const out = applyRefinement(icp, refinement({ weight_changes: [{ id: 'technical', weight: 33 }, { id: 'culture', weight: 33 }] }))
    expect(out.source).toBe('refinement')
    expect(out.competencies.reduce((s, c) => s + c.weight, 0)).toBe(100)
  })
})
