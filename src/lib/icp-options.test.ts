import { describe, it, expect } from 'vitest'
import { optionsFor, bandLabel, INDUSTRY_SECTORS, YEARS_BANDS, EMPTY_OPTIONS } from './icp-options'
import { SECTOR_RULES } from './industries/sectors'

describe('optionsFor', () => {
  it('offers the database lists for the open fields', () => {
    const fetched = { ...EMPTY_OPTIONS, cities: ['Pune, Maharashtra, India'], titles: ['Staff Engineer'], companies: ['Flipkart'], skills: ['Go'] }
    expect(optionsFor('location', fetched)).toEqual(['Pune, Maharashtra, India'])
    expect(optionsFor('title_any', fetched)).toEqual(['Staff Engineer'])
    expect(optionsFor('employer_past', fetched)).toEqual(['Flipkart'])
    expect(optionsFor('skill', fetched)).toEqual(['Go'])
  })

  it('offers the written vocabulary for the closed ones, with no database at all', () => {
    expect(optionsFor('funding_stage')).toContain('Series B')
    expect(optionsFor('seniority')).toContain('Staff')
    expect(optionsFor('company_size')).toContain('10,001+')
  })

  it('filters industry by the SAME sectors that label a candidate', () => {
    // If these two lists ever drift, a recruiter filtering for "Fintech" stops getting
    // the people whose profile chip says Fintech.
    expect(optionsFor('industry')).toEqual(INDUSTRY_SECTORS)
    expect(new Set(INDUSTRY_SECTORS)).toEqual(new Set(SECTOR_RULES.map((r) => r.sector)))
  })

  it('merges the org’s own departments into the function list', () => {
    const o = optionsFor('function', { ...EMPTY_OPTIONS, departments: ['Growth', 'Engineering'] })
    expect(o).toContain('Growth')
    expect(o.filter((x) => x === 'Engineering')).toHaveLength(1)
  })

  it('returns nothing for a field we have no honest list for', () => {
    // A school picker built from 40 guesses would get in the way of the 41st school.
    expect(optionsFor('school')).toEqual([])
  })
})

describe('bandLabel', () => {
  it('recognises a preset so an existing band shows as chosen', () => {
    expect(bandLabel(6, 12)).toBe('6–12 years')
    expect(bandLabel(10, null)).toBe('10+ years')
  })

  it('is null for a band nobody picked from the list', () => {
    expect(bandLabel(7, 9)).toBeNull()
    expect(bandLabel(null, null)).toBeNull()
  })

  it('has no two presets with the same bounds', () => {
    const keys = YEARS_BANDS.map((b) => `${b.min}-${b.max}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
