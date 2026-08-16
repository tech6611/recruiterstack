import { describe, it, expect } from 'vitest'
import { buildFitCandidate, buildProfileText } from './ext-profile'

describe('buildFitCandidate', () => {
  it('maps the headline to the current title and keeps skills/location', () => {
    const c = buildFitCandidate({
      name: 'Priya Nair',
      headline: 'Senior Product Manager at Acme',
      location: 'Bengaluru, India',
      skills: [' SQL ', 'Roadmapping', ''],
    })
    expect(c.name).toBe('Priya Nair')
    expect(c.current_title).toBe('Senior Product Manager at Acme')
    expect(c.location).toBe('Bengaluru, India')
    expect(c.skills).toEqual(['SQL', 'Roadmapping']) // trimmed, blanks dropped
  })

  it('never invents experience_years (unknown must not count against a candidate)', () => {
    const c = buildFitCandidate({ name: 'A', experience: ['PM at X (2019-2024)'] })
    expect(c.experience_years).toBeNull()
  })

  it('falls back to a placeholder name and null fields when data is missing', () => {
    const c = buildFitCandidate({ name: '' })
    expect(c.name).toBe('Candidate')
    expect(c.current_title).toBeNull()
    expect(c.location).toBeNull()
    expect(c.skills).toEqual([])
  })
})

describe('buildProfileText', () => {
  it('weaves About, experience and skills into one blurb', () => {
    const t = buildProfileText({
      name: 'Priya',
      about: 'Operator who loves 0→1 products.',
      experience: ['Senior PM at Acme (2019–2024)', 'PM at Beta (2016–2019)'],
      skills: ['SQL', 'Roadmapping'],
    })
    expect(t).toContain('About:')
    expect(t).toContain('0→1 products')
    expect(t).toContain('- Senior PM at Acme (2019–2024)')
    expect(t).toContain('Skills: SQL, Roadmapping')
  })

  it('returns an empty string when there is nothing beyond structured fields', () => {
    expect(buildProfileText({ name: 'Priya' })).toBe('')
  })
})
