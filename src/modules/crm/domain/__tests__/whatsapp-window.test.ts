import { describe, it, expect } from 'vitest'
import { isWithinServiceWindow } from '../whatsapp'

const NOW = new Date('2026-06-10T12:00:00Z')

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()
}

describe('isWithinServiceWindow', () => {
  it('is false when the candidate has never messaged us', () => {
    expect(isWithinServiceWindow({ last_inbound_at: null }, NOW)).toBe(false)
  })

  it('is true just inside the 24h window', () => {
    expect(isWithinServiceWindow({ last_inbound_at: hoursAgo(23.98) }, NOW)).toBe(true)
    expect(isWithinServiceWindow({ last_inbound_at: hoursAgo(1) }, NOW)).toBe(true)
  })

  it('is false at and beyond 24h', () => {
    expect(isWithinServiceWindow({ last_inbound_at: hoursAgo(24) }, NOW)).toBe(false)
    expect(isWithinServiceWindow({ last_inbound_at: hoursAgo(24.02) }, NOW)).toBe(false)
    expect(isWithinServiceWindow({ last_inbound_at: hoursAgo(72) }, NOW)).toBe(false)
  })
})
