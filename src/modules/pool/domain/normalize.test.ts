import { describe, it, expect } from 'vitest'
import { normalizeCity, normalizeCompany, editDistance, slugifyPlace } from './normalize'

describe('normalizeCity', () => {
  it('collapses the spellings the GitHub pull actually produced', () => {
    for (const s of ['Bangalore', 'Bengaluru', 'Bangalore, India', 'Bengaluru, Karnataka',
                     'bangalore', 'Bangalore,India', 'Bangalore India', 'Bangalore, IN',
                     'Bengaluru, Karnataka, India']) {
      expect(normalizeCity(s)).toBe('Bengaluru')
    }
  })
  it('catches misspellings within the edit budget', () => {
    expect(normalizeCity('Banglore, India')).toBe('Bengaluru')   // the CV-folder case
    expect(normalizeCity('Bengalore')).toBe('Bengaluru')
    expect(normalizeCity('Hyderbad')).toBe('Hyderabad')
  })
  it('treats a movement marker as "ended up here"', () => {
    expect(normalizeCity('Kolkata ✈ Bangalore')).toBe('Bengaluru')
    expect(normalizeCity('Pune -> Hyderabad')).toBe('Hyderabad')
  })
  it('otherwise takes the first city, since "City, State" is the common shape', () => {
    expect(normalizeCity('Mumbai, Bangalore')).toBe('Mumbai')
    expect(normalizeCity('Electronic City, Bangalore')).toBe('Bengaluru')
  })
  it('maps metro satellites onto their hub', () => {
    expect(normalizeCity('Gurugram')).toBe('Delhi NCR')
    expect(normalizeCity('Noida, UP')).toBe('Delhi NCR')
    expect(normalizeCity('Navi Mumbai')).toBe('Mumbai')
  })
  it('returns null rather than guessing', () => {
    expect(normalizeCity('')).toBeNull()
    expect(normalizeCity(null)).toBeNull()
    expect(normalizeCity('Remote')).toBeNull()
    expect(normalizeCity('Earth')).toBeNull()
  })
  it('does not fuzzy-match a genuinely different city onto a known one', () => {
    expect(normalizeCity('Kigali')).toBeNull()
    expect(normalizeCity('Toronto')).toBeNull()
  })
})

describe('normalizeCompany', () => {
  it('strips the GitHub @handle convention', () => {
    expect(normalizeCompany('@google')).toBe('google')
    expect(normalizeCompany('@Walmart Labs')).toBe('Walmart')
  })
  it('strips legal suffixes', () => {
    expect(normalizeCompany('PayU Digital Labs Pvt. Ltd.')).toBe('PayU Digital')
    expect(normalizeCompany('Domain Network Pvt. Ltd')).toBe('Domain Network')
  })
  it('keeps only the employer when a title is appended', () => {
    expect(normalizeCompany('Cisco | Senior Engineer')).toBe('Cisco')
    expect(normalizeCompany('Infosys - SDE2')).toBe('Infosys')
  })
  it('returns null for empty input', () => {
    expect(normalizeCompany(null)).toBeNull()
    expect(normalizeCompany('   ')).toBeNull()
  })
})

describe('helpers', () => {
  it('slugifyPlace strips accents and punctuation', () => {
    expect(slugifyPlace('Bengalūru, KA!')).toBe('bengaluru ka')
  })
  it('editDistance caps early', () => {
    expect(editDistance('bangalore', 'banglore')).toBe(1)
    expect(editDistance('abc', 'xyzxyzxyz', 3)).toBe(4)
  })
})
