import { describe, it, expect } from 'vitest'
import { summarizeSeats, pickSeatToFill } from './seat-math'

describe('summarizeSeats', () => {
  it('counts open/filled/closed, ignores archived, and derives remaining', () => {
    expect(summarizeSeats(['open', 'open', 'filled', 'closed', 'archived'])).toEqual({ total: 3, open: 2, filled: 1, closed: 1, remaining: 2 })
  })
  it('is empty with no seats', () => {
    expect(summarizeSeats([])).toEqual({ total: 0, open: 0, filled: 0, closed: 0, remaining: 0 })
  })
})

describe('pickSeatToFill', () => {
  it('prefers the oldest open seat, then the oldest approved one', () => {
    const seats = [
      { id: 'a', status: 'approved', linked_at: '2026-01-01' },
      { id: 'b', status: 'open',     linked_at: '2026-02-01' },
      { id: 'c', status: 'open',     linked_at: '2026-01-15' },
      { id: 'd', status: 'filled',   linked_at: '2025-12-01' },
    ]
    expect(pickSeatToFill(seats)).toBe('c')
    expect(pickSeatToFill(seats.filter(s => s.status !== 'open'))).toBe('a')
    expect(pickSeatToFill([{ id: 'd', status: 'filled', linked_at: '2025-12-01' }])).toBeNull()
  })
})
