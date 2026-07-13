import { describe, it, expect } from 'vitest'
import { applyTokens, tokensUsed, SEQUENCE_TOKENS } from '../tokens'

describe('applyTokens', () => {
  it('substitutes provided values', () => {
    expect(applyTokens('Hi {{candidate_first_name}}', { candidate_first_name: 'Jane' }))
      .toBe('Hi Jane')
  })

  it('falls back to a natural default when a known value is blank', () => {
    expect(applyTokens('at {{candidate_company}}', { candidate_company: '' }))
      .toBe('at your company')
    expect(applyTokens('at {{candidate_company}}', {}))
      .toBe('at your company')
  })

  it('blanks an unrecognised token so raw placeholders never leak', () => {
    expect(applyTokens('x {{totally_unknown}} y', {})).toBe('x  y')
  })

  describe('hiring_manager_calendar', () => {
    it('uses the resolved URL when present', () => {
      const url = 'https://recruiterstack.in/schedule/abc123'
      expect(applyTokens('Book here: {{hiring_manager_calendar}}', { hiring_manager_calendar: url }))
        .toBe(`Book here: ${url}`)
    })

    it('falls back to a sentence (not a dead link) when the HM is unresolvable', () => {
      const out = applyTokens('Book here: {{hiring_manager_calendar}}', {})
      expect(out).toBe('Book here: the hiring team will reach out to schedule a time')
      expect(out).not.toContain('{{')
    })
  })
})

describe('tokensUsed', () => {
  it('reports the hiring_manager_calendar token when a body uses it', () => {
    const used = tokensUsed('subj', 'Pick a slot: {{hiring_manager_calendar}}')
    expect(used.map(t => t.key)).toContain('hiring_manager_calendar')
  })

  it('is registered in the shared token list', () => {
    expect(SEQUENCE_TOKENS.some(t => t.key === 'hiring_manager_calendar')).toBe(true)
  })
})
