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

  it('PRESERVES the structured fields (they were being silently stripped)', () => {
    const structured = {
      id: 'g-loc', label: 'Within 50 km of San Francisco', attribute: 'location', operator: 'criterion', value: ['San Francisco'],
      kind: 'location' as const, values: ['San Francisco'], radius_km: 50, relax_at: 4,
    }
    const r = icpMustHaveSchema.parse(structured)
    expect(r.kind).toBe('location')
    expect(r.values).toEqual(['San Francisco'])
    expect(r.radius_km).toBe(50)
    expect(r.relax_at).toBe(4)
  })

  it('preserves a years band and an exclusion criterion', () => {
    const band = icpMustHaveSchema.parse({ id: 'g-y', label: '6–12 years', kind: 'years_band' as const, min: 6, max: 12 })
    expect(band).toMatchObject({ kind: 'years_band', min: 6, max: 12 })
    const excl = icpMustHaveSchema.parse({ id: 'g-x', label: 'Exclude titles', kind: 'title_current' as const, values: ['TPM'], exclude: true })
    expect(excl).toMatchObject({ kind: 'title_current', values: ['TPM'], exclude: true })
  })

  it('rejects an unknown kind (guards against typos)', () => {
    expect(icpMustHaveSchema.safeParse({ id: 'g1', label: 'x', kind: 'not_a_kind' }).success).toBe(false)
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
