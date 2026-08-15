import { describe, it, expect } from 'vitest'
import { icpToScoringCriteria } from './scoring'
import type { IcpCompetency } from '@/lib/types/icp'

describe('icpToScoringCriteria (ICP → flat rubric down-projection)', () => {
  it('projects competencies to id/name/weight/description and drops ICP-only fields', () => {
    const competencies: IcpCompetency[] = [
      {
        id: 'technical',
        name: 'Technical Skills',
        weight: 35,
        description: 'Depth in the stack',
        verbatim: 'must ship without hand-holding',
        behaviours: ['owns a service end to end'],
        anchors: { '1': 'a', '2': 'b', '3': 'c', '4': 'd' },
      },
    ]

    const result = icpToScoringCriteria({ competencies })

    // Shape the existing Sifter + Scoring tab expect — nothing extra leaks through.
    expect(result).toEqual([
      { id: 'technical', name: 'Technical Skills', weight: 35, description: 'Depth in the stack' },
    ])
  })

  it('defaults a missing description to an empty string', () => {
    const competencies: IcpCompetency[] = [
      { id: 'culture', name: 'Culture Fit', weight: 20, behaviours: [] },
    ]
    expect(icpToScoringCriteria({ competencies })[0].description).toBe('')
  })

  it('returns an empty rubric for an ICP with no competencies', () => {
    expect(icpToScoringCriteria({ competencies: [] })).toEqual([])
  })

  it('preserves order and total weight (so the rubric still sums to 100)', () => {
    const competencies: IcpCompetency[] = [
      { id: 'technical', name: 'Technical Skills', weight: 35, behaviours: [] },
      { id: 'experience', name: 'Domain Experience', weight: 25, behaviours: [] },
      { id: 'communication', name: 'Communication', weight: 20, behaviours: [] },
      { id: 'culture', name: 'Culture Fit', weight: 20, behaviours: [] },
    ]
    const result = icpToScoringCriteria({ competencies })
    expect(result.map((c) => c.id)).toEqual(['technical', 'experience', 'communication', 'culture'])
    expect(result.reduce((sum, c) => sum + c.weight, 0)).toBe(100)
  })
})
