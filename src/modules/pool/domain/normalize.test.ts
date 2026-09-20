import { describe, it, expect } from 'vitest'
import { normalizeCity, normalizeCompany, editDistance, slugifyPlace, resolveLocationParts, formatLocationParts } from './normalize'

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
    expect(normalizeCity('Winnipeg')).toBeNull()
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

import { formatLocation } from './normalize'

describe('formatLocation — international hubs', () => {
  it('standardises the New York spellings the vendor produces', () => {
    expect(formatLocation('New York, New York, United States')).toBe('New York, United States')
    expect(formatLocation('New York City Metropolitan Area')).toBe('New York, United States')
    expect(formatLocation('Brooklyn, NY')).toBe('New York, United States')
  })
  it('handles other hubs and keeps India working; unknown strings pass through', () => {
    expect(formatLocation('San Francisco Bay Area')).toBe('San Francisco, United States')
    expect(formatLocation('Greater London')).toBe('London, United Kingdom')
    expect(formatLocation('Bangalore')).toBe('Bengaluru, India')
    expect(formatLocation('Winnipeg, Manitoba, Canada')).toBe('Winnipeg, Manitoba, Canada')
    expect(formatLocation('')).toBeNull()
  })
  it('does not match short aliases inside other words', () => {
    expect(formatLocation('Transferred to Hydrology dept')).toBe('Transferred to Hydrology dept')
  })
})

describe('formatLocation — India & US dictionary', () => {
  it('recognises any Indian city, not just the metros', () => {
    expect(formatLocation('Surat, Gujarat, India')).toBe('Surat, India')
    expect(formatLocation('Nagpur')).toBe('Nagpur, India')
    expect(formatLocation('Vellore, Tamil Nadu')).toBe('Vellore, India')
    expect(formatLocation('Guwahati, Assam')).toBe('Guwahati, India')
  })
  it('recognises any US city, disambiguating by state', () => {
    expect(formatLocation('Springfield, IL')).toBe('Springfield, United States')
    expect(formatLocation('Springfield, Missouri, United States')).toBe('Springfield, United States')
    expect(formatLocation('Indianapolis, IN')).toBe('Indianapolis, United States')
    expect(formatLocation('Portland, Oregon')).toBe('Portland, United States')
    expect(formatLocation('Winston-Salem, NC')).toBe('Winston-Salem, United States')
    expect(formatLocation('Austin Texas')).toBe('Austin, United States')
  })
  it('lets a state hint override an international hub of the same name', () => {
    expect(formatLocation('Paris, TX')).toBe('Paris, United States')
    expect(formatLocation('Paris, Texas')).toBe('Paris, United States')
    expect(formatLocation('Paris, France')).toBe('Paris, France')
    expect(formatLocation('Berlin, DE')).toBe('Berlin, Germany')
  })
  it('does not force a hub when the country says otherwise', () => {
    expect(formatLocation('London, Ontario, Canada')).toBe('London, Ontario, Canada')
    expect(formatLocation('Sydney, Nova Scotia, Canada')).toBe('Sydney, Nova Scotia, Canada')
  })
  it('handles metro shorthand and neighbourhood-first strings', () => {
    expect(formatLocation('Raleigh-Durham-Chapel Hill Area')).toBe('Raleigh, United States')
    expect(formatLocation('Dallas-Fort Worth Metroplex')).toBe('Dallas, United States')
    expect(formatLocation('Greater Philadelphia')).toBe('Philadelphia, United States')
    expect(formatLocation('Koramangala, Bengaluru')).toBe('Bengaluru, India')
  })
  it('will not guess a small town from its name alone', () => {
    expect(formatLocation('Hope')).toBe('Hope')
    expect(formatLocation('Earth')).toBe('Earth')
    expect(formatLocation('Hope, AR')).toBe('Hope, United States')
    expect(formatLocation('Springfield, Ontario')).toBe('Springfield, Ontario')
  })
  it('keeps the "IN" ambiguity (India vs Indiana) honest', () => {
    expect(formatLocation('Surat, IN')).toBe('Surat, India')
    expect(formatLocation('Carmel, IN')).toBe('Carmel, United States')
  })
})

describe('resolveLocationParts — city / region / country as separate fields', () => {
  it('fills all three from the dictionary', () => {
    expect(resolveLocationParts('Surat, Gujarat')).toEqual({ city: 'Surat', region: 'Gujarat', country: 'India', country_code: 'IN' })
    expect(resolveLocationParts('Springfield, IL')).toEqual({ city: 'Springfield', region: 'Illinois', country: 'United States', country_code: 'US' })
  })
  it('fills the region for hand-kept hubs too', () => {
    expect(resolveLocationParts('Banglore, India')).toEqual({ city: 'Bengaluru', region: 'Karnataka', country: 'India', country_code: 'IN' })
    expect(resolveLocationParts('Gurgaon')).toEqual({ city: 'Delhi NCR', region: 'Delhi', country: 'India', country_code: 'IN' })
    expect(resolveLocationParts('SF Bay Area')).toEqual({ city: 'San Francisco', region: 'California', country: 'United States', country_code: 'US' })
    expect(resolveLocationParts('Singapore')).toEqual({ city: 'Singapore', region: null, country: 'Singapore', country_code: 'SG' })
  })
  it('keeps the lower levels when no city is recognised', () => {
    expect(resolveLocationParts('Remote, India')).toEqual({ city: null, region: null, country: 'India', country_code: 'IN' })
    expect(resolveLocationParts('Karnataka')).toEqual({ city: null, region: 'Karnataka', country: 'India', country_code: 'IN' })
    expect(resolveLocationParts('Remote - Germany')).toEqual({ city: null, region: null, country: 'Germany', country_code: 'DE' })
  })
  it('does not invent a country from a weak two-letter hint', () => {
    expect(resolveLocationParts('Remote')).toBeNull()
    expect(resolveLocationParts('Earth')).toBeNull()
    expect(resolveLocationParts('')).toBeNull()
  })
})

describe('formatLocationParts', () => {
  it('reads like Ashby: "City, Country", falling back to the region or country', () => {
    expect(formatLocationParts({ city: 'Pune', region: 'Maharashtra', country: 'India', country_code: 'IN' })).toBe('Pune, India')
    expect(formatLocationParts({ city: null, region: 'Karnataka', country: 'India', country_code: 'IN' })).toBe('Karnataka, India')
    expect(formatLocationParts({ city: null, region: null, country: 'India', country_code: 'IN' })).toBe('India')
    expect(formatLocationParts({ city: null, region: null, country: null, country_code: null })).toBeNull()
    expect(formatLocation('Singapore')).toBe('Singapore')
    expect(formatLocation('Paris, TX')).toBe('Paris, United States')
  })
})
