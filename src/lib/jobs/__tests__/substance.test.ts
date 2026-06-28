import { describe, it, expect } from 'vitest'
import { normalizeText, extractSubstance, diffSubstance } from '../substance'

describe('normalizeText', () => {
  it('strips HTML tags and keeps the words', () => {
    expect(normalizeText('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('treats formatting-only changes as equal', () => {
    const plain = normalizeText('<p>Owns the roadmap</p>')
    const bold  = normalizeText('<p>Owns the <strong>roadmap</strong></p>')
    const bullet = normalizeText('<ul><li>Owns the roadmap</li></ul>')
    expect(plain).toBe(bold)
    expect(plain).toBe(bullet)
  })

  it('collapses whitespace and decodes entities', () => {
    expect(normalizeText('<p>A&nbsp;&amp;  B</p>')).toBe('A & B')
  })

  it('handles null/undefined as empty', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
  })
})

describe('extractSubstance', () => {
  it('reads description and intake fields', () => {
    const s = extractSubstance({
      description: '<p>Build things</p>',
      custom_fields: { intake: { key_requirements: '<p>5y exp</p>', nice_to_have: 'Go', team_context: 'Platform', level: 'Senior' } },
    })
    expect(s).toEqual({
      description: 'Build things',
      key_requirements: '5y exp',
      nice_to_have: 'Go',
      team_context: 'Platform',
      level: 'Senior',
    })
  })

  it('tolerates missing custom_fields/intake', () => {
    const s = extractSubstance({ description: 'x' })
    expect(s.key_requirements).toBe('')
    expect(s.description).toBe('x')
  })
})

describe('diffSubstance', () => {
  const base = extractSubstance({
    description: '<p>Build the API</p>',
    custom_fields: { intake: { key_requirements: '<p>5 years</p>', nice_to_have: '', team_context: '', level: 'Senior' } },
  })

  it('returns [] when only formatting changed', () => {
    const after = extractSubstance({
      description: '<p>Build the <em>API</em></p>',
      custom_fields: { intake: { key_requirements: '<ul><li>5 years</li></ul>', nice_to_have: '', team_context: '', level: 'Senior' } },
    })
    expect(diffSubstance(base, after)).toEqual([])
  })

  it('flags a wording change in requirements', () => {
    const after = extractSubstance({
      description: '<p>Build the API</p>',
      custom_fields: { intake: { key_requirements: '<p>8 years</p>', nice_to_have: '', team_context: '', level: 'Senior' } },
    })
    expect(diffSubstance(base, after)).toEqual(['key_requirements'])
  })

  it('flags multiple changed fields', () => {
    const after = extractSubstance({
      description: '<p>Build the mobile app</p>',
      custom_fields: { intake: { key_requirements: '<p>5 years</p>', nice_to_have: '', team_context: '', level: 'Staff' } },
    })
    expect(diffSubstance(base, after).sort()).toEqual(['description', 'level'])
  })
})
