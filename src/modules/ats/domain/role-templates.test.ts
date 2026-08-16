import { describe, it, expect } from 'vitest'
import { templateToDraftInput } from './role-templates'

describe('templateToDraftInput', () => {
  it('copies gates + competencies and marks the ICP as template-sourced', () => {
    const draft = templateToDraftInput({
      must_haves: [{ id: 'g1', label: 'SQL', attribute: 'skill', operator: 'includes', value: 'sql' }],
      competencies: [
        { id: 'technical', name: 'Technical', weight: 60, behaviours: [] },
        { id: 'experience', name: 'Experience', weight: 40, behaviours: [] },
      ],
    })
    expect(draft.source).toBe('template')
    expect(draft.competencies).toHaveLength(2)
    expect(draft.competencies.reduce((s, c) => s + c.weight, 0)).toBe(100)
    expect(draft.must_haves[0].label).toBe('SQL')
  })

  it('degrades to empty arrays when a template has no gates/competencies', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draft = templateToDraftInput({ must_haves: undefined as any, competencies: undefined as any })
    expect(draft.must_haves).toEqual([])
    expect(draft.competencies).toEqual([])
  })
})
