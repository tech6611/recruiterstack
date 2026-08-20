import { describe, it, expect } from 'vitest'
import { icpDraftInputSchema, icpMustHaveSchema } from './icp'

describe('icpMustHaveSchema', () => {
  it('accepts a label-only must-have (empty legacy attribute/operator/value)', () => {
    // This is the shape the editor + reasoning-first generation now produce; requiring
    // attribute/operator broke ICP save/approve.
    const r = icpMustHaveSchema.safeParse({
      id: 'g-ai-0',
      label: 'Has a genuine software-engineering background?',
      attribute: '',
      operator: '',
      value: '',
    })
    expect(r.success).toBe(true)
  })

  it('defaults the legacy fields when omitted entirely', () => {
    const r = icpMustHaveSchema.parse({ id: 'g1', label: 'Holds an active nursing license?' })
    expect(r).toMatchObject({ attribute: '', operator: '', value: '' })
  })

  it('still requires a non-empty label', () => {
    expect(icpMustHaveSchema.safeParse({ id: 'g1', label: '' }).success).toBe(false)
  })

  it('still accepts a legacy fully-specified gate', () => {
    const r = icpMustHaveSchema.safeParse({ id: 'g1', label: '5+ years', attribute: 'min_experience', operator: 'gte', value: '5' })
    expect(r.success).toBe(true)
  })
})

describe('icpDraftInputSchema', () => {
  it('validates a full draft with label-only gates (the approve payload)', () => {
    const r = icpDraftInputSchema.safeParse({
      must_haves: [{ id: 'g-ai-0', label: 'Right kind of professional?', attribute: '', operator: '', value: '' }],
      competencies: [{ id: 'lead', name: 'Leadership', weight: 100, behaviours: [] }],
      source: 'refinement',
    })
    expect(r.success).toBe(true)
  })
})
