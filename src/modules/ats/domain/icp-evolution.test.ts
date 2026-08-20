import { describe, it, expect } from 'vitest'
import { diffIcpVersions } from './icp'
import type { IcpCompetency, IcpMustHave } from '@/lib/types/icp'

const comp = (id: string, name: string, weight: number): IcpCompetency => ({ id, name, weight, behaviours: [] })
const gate = (label: string): IcpMustHave => ({ id: label, label, attribute: '', operator: '', value: '' })

describe('diffIcpVersions', () => {
  it('reports weight changes, added/removed competencies, and gate changes', () => {
    const prev = {
      competencies: [comp('lead', 'Leadership', 30), comp('tech', 'Technical', 40), comp('comm', 'Communication', 30)],
      must_haves: [gate('5+ years'), gate('Based in Bengaluru')],
    }
    const curr = {
      competencies: [comp('lead', 'Leadership', 45), comp('tech', 'Technical', 40), comp('scale', 'Scale & Complexity', 15)],
      must_haves: [gate('5+ years'), gate('Engineering background')],
    }
    const d = diffIcpVersions(prev, curr)
    expect(d.weight_changes).toEqual([{ id: 'lead', name: 'Leadership', from: 30, to: 45 }])
    expect(d.competencies_added).toEqual(['Scale & Complexity'])
    expect(d.competencies_removed).toEqual(['Communication'])
    expect(d.gates_added).toEqual(['Engineering background'])
    expect(d.gates_removed).toEqual(['Based in Bengaluru'])
  })

  it('is empty when nothing changed', () => {
    const v = { competencies: [comp('a', 'A', 100)], must_haves: [gate('g')] }
    const d = diffIcpVersions(v, { competencies: [comp('a', 'A', 100)], must_haves: [gate('g')] })
    expect(d.weight_changes).toHaveLength(0)
    expect(d.competencies_added).toHaveLength(0)
    expect(d.competencies_removed).toHaveLength(0)
    expect(d.gates_added).toHaveLength(0)
    expect(d.gates_removed).toHaveLength(0)
  })
})
