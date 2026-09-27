import { describe, it, expect } from 'vitest'
import { formatLocation } from './location'

describe('formatLocation', () => {
  it('names the city, the state and the country', () => {
    expect(formatLocation({ location_city: 'Bengaluru', location_region: 'Karnataka', location_country: 'India' }))
      .toBe('Bengaluru, Karnataka, India')
  })

  it('collapses a city-state rather than printing it three times', () => {
    expect(formatLocation({ location_city: 'Singapore', location_region: 'Singapore', location_country: 'Singapore' }))
      .toBe('Singapore')
  })

  it('ignores case and stray space when collapsing', () => {
    expect(formatLocation({ location_city: 'New Delhi', location_region: ' new delhi ', location_country: 'India' }))
      .toBe('New Delhi, India')
  })

  it('drops the parts we do not have instead of leaving gaps', () => {
    expect(formatLocation({ location_city: null, location_region: 'Texas', location_country: 'United States' }))
      .toBe('Texas, United States')
    expect(formatLocation({ location_country: 'India' })).toBe('India')
  })

  it('is null when we know nothing, so a caller can omit the line', () => {
    expect(formatLocation({})).toBeNull()
    expect(formatLocation(null)).toBeNull()
    expect(formatLocation({ location_city: '   ' })).toBeNull()
  })
})
