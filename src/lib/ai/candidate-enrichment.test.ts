import { describe, it, expect } from 'vitest'
import { normalizeMonth, deriveMovability, toEnrichedProfile, type EnrichedExperience } from './candidate-enrichment'

describe('normalizeMonth', () => {
  it('parses common résumé date shapes to first-of-month', () => {
    expect(normalizeMonth('2019-03')).toBe('2019-03-01')
    expect(normalizeMonth('2019/3')).toBe('2019-03-01')
    expect(normalizeMonth('Jan 2019')).toBe('2019-01-01')
    expect(normalizeMonth('January 2019')).toBe('2019-01-01')
    expect(normalizeMonth('2019')).toBe('2019-01-01')
  })
  it('treats present/current/blank as null (never guesses)', () => {
    expect(normalizeMonth('Present')).toBeNull()
    expect(normalizeMonth('current')).toBeNull()
    expect(normalizeMonth('')).toBeNull()
    expect(normalizeMonth(null)).toBeNull()
  })
})

describe('deriveMovability', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  const roles: EnrichedExperience[] = [
    { title: 'Senior PM', employer: 'Acme', location: null, start_date: '2024-01-01', end_date: null, is_current: true, summary: null },
    { title: 'PM', employer: 'Beta', location: null, start_date: '2020-01-01', end_date: '2024-01-01', is_current: false, summary: null },
  ]
  it('computes tenure, total experience and cadence from dated history', () => {
    const m = deriveMovability(roles, now)
    expect(m.num_roles).toBe(2)
    expect(m.current_tenure_months).toBe(24)     // Jan 2024 → Jan 2026
    expect(m.total_experience_months).toBe(72)   // Jan 2020 → Jan 2026
    expect(m.last_move_months_ago).toBe(24)      // most recent start
    expect(m.avg_tenure_months).toBe(36)
  })
  it('returns nulls (not NaN) when no dates are known', () => {
    const m = deriveMovability([{ title: 'x', employer: null, location: null, start_date: null, end_date: null, is_current: false, summary: null }], now)
    expect(m.num_roles).toBe(1)
    expect(m.current_tenure_months).toBeNull()
    expect(m.total_experience_months).toBeNull()
  })
})

describe('toEnrichedProfile', () => {
  it('normalizes dates and infers is_current from a "present" end', () => {
    const p = toEnrichedProfile({
      current_title: ' Staff Eng ', current_company: 'Acme', location: 'Bengaluru', experience_years: 8,
      skills: [' Go ', ''], experiences: [{ title: 'Staff Eng', employer: 'Acme', start: 'Mar 2022', end: 'present', is_current: false }],
      education: [{ degree: 'BTech', field: 'CS', school: 'IIT', year: 2016 }],
    })
    expect(p.current_title).toBe('Staff Eng')
    expect(p.skills).toEqual(['Go'])
    expect(p.experiences[0].start_date).toBe('2022-03-01')
    expect(p.experiences[0].is_current).toBe(true) // inferred from "present"
    expect(p.experiences[0].end_date).toBeNull()
    expect(p.education[0].year).toBe(2016)
  })
})
