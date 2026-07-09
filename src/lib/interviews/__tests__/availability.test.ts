import { describe, it, expect } from 'vitest'
import {
  zonedWallClockToUtcMs,
  nextBusinessDays,
  mergeIntervals,
  subtractIntervals,
  intersectMany,
  computeSlots,
  type InterviewerAvailability,
} from '../availability'

const MIN = 60_000
const H = 60 * MIN

// weekday (0=Sun..6=Sat) of a calendar date, same convention the engine uses.
const wd = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).getUTCDay()

describe('zonedWallClockToUtcMs', () => {
  it('converts a UTC wall clock to itself', () => {
    const ms = zonedWallClockToUtcMs('UTC', 2026, 6, 15, 9 * 60)
    expect(new Date(ms).toISOString()).toBe('2026-07-15T09:00:00.000Z')
  })

  it('converts IST (+5:30) wall clock to UTC', () => {
    // 09:00 IST == 03:30 UTC
    const ms = zonedWallClockToUtcMs('Asia/Kolkata', 2026, 6, 15, 9 * 60)
    expect(new Date(ms).toISOString()).toBe('2026-07-15T03:30:00.000Z')
  })

  it('converts US Eastern (summer -4:00) wall clock to UTC', () => {
    // 09:00 America/New_York (EDT) == 13:00 UTC in July
    const ms = zonedWallClockToUtcMs('America/New_York', 2026, 6, 15, 9 * 60)
    expect(new Date(ms).toISOString()).toBe('2026-07-15T13:00:00.000Z')
  })
})

describe('nextBusinessDays', () => {
  it('returns N weekdays, never Sat/Sun, strictly increasing', () => {
    // Start on a Saturday to prove weekends are skipped from the very first day.
    const sat = Date.UTC(2026, 6, 11)  // 2026-07-11
    expect(wd(2026, 6, 11)).toBe(6)     // sanity: it's a Saturday
    const days = nextBusinessDays('UTC', 7, sat)

    expect(days).toHaveLength(7)
    for (const d of days) expect([0, 6]).not.toContain(wd(d.y, d.m0, d.d))
    // first business day after Sat is Mon
    expect(wd(days[0].y, days[0].m0, days[0].d)).toBe(1)
    // increasing
    const stamps = days.map(d => Date.UTC(d.y, d.m0, d.d))
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]).toBeGreaterThan(stamps[i - 1])
  })

  it('includes today when today is a weekday', () => {
    const wed = Date.UTC(2026, 6, 15)  // Wednesday
    expect(wd(2026, 6, 15)).toBe(3)
    const days = nextBusinessDays('UTC', 1, wed)
    expect(days[0]).toEqual({ y: 2026, m0: 6, d: 15 })
  })
})

describe('interval math', () => {
  it('mergeIntervals merges overlapping/adjacent and drops empties', () => {
    expect(mergeIntervals([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 20, end: 20 }]))
      .toEqual([{ start: 0, end: 15 }])
  })
  it('subtractIntervals cuts out busy blocks', () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 30, end: 50 }]))
      .toEqual([{ start: 0, end: 30 }, { start: 50, end: 100 }])
  })
  it('intersectMany intersects several interval sets', () => {
    expect(intersectMany([
      [{ start: 0, end: 100 }],
      [{ start: 20, end: 80 }],
      [{ start: 50, end: 200 }],
    ])).toEqual([{ start: 50, end: 80 }])
  })
  it('intersectMany of disjoint sets is empty', () => {
    expect(intersectMany([[{ start: 0, end: 10 }], [{ start: 20, end: 30 }]])).toEqual([])
  })
})

describe('computeSlots', () => {
  const date = { y: 2026, m0: 6, d: 15 }             // Wednesday
  const day = wd(date.y, date.m0, date.d)
  const window9to18 = { day, start: 9 * 60, end: 18 * 60 }

  const interviewer = (over: Partial<InterviewerAvailability> = {}): InterviewerAvailability => ({
    email: 'a@x.com', timezone: 'UTC', windows: [window9to18], busy: [], ...over,
  })

  it('emits hourly 60-min slots across a 9–18 UTC window', () => {
    const slots = computeSlots([interviewer()], [date], H, H, 0)
    // starts 09:00..17:00 → 9 slots
    expect(slots).toHaveLength(9)
    expect(new Date(slots[0].start).toISOString()).toBe('2026-07-15T09:00:00.000Z')
    expect(new Date(slots[8].start).toISOString()).toBe('2026-07-15T17:00:00.000Z')
    expect(new Date(slots[8].end).toISOString()).toBe('2026-07-15T18:00:00.000Z')
  })

  it('removes slots overlapping a busy block', () => {
    const busy = [{ start: zonedWallClockToUtcMs('UTC', date.y, date.m0, date.d, 12 * 60), end: zonedWallClockToUtcMs('UTC', date.y, date.m0, date.d, 13 * 60) }]
    const slots = computeSlots([interviewer({ busy })], [date], H, H, 0)
    const starts = slots.map(s => new Date(s.start).getUTCHours())
    expect(starts).not.toContain(12)
    expect(slots).toHaveLength(8)
  })

  it('a panel only offers times when everyone is free & in-hours', () => {
    const other = interviewer({ email: 'b@x.com', windows: [{ day, start: 13 * 60, end: 20 * 60 }] })
    const slots = computeSlots([interviewer(), other], [date], H, H, 0)
    // intersection 13:00–18:00 → starts 13..17 = 5
    expect(slots.map(s => new Date(s.start).getUTCHours())).toEqual([13, 14, 15, 16, 17])
  })

  it('respects the earliest-start (lead time) cutoff', () => {
    const earliest = zonedWallClockToUtcMs('UTC', date.y, date.m0, date.d, 15 * 60)
    const slots = computeSlots([interviewer()], [date], H, H, earliest)
    expect(slots.map(s => new Date(s.start).getUTCHours())).toEqual([15, 16, 17])
  })

  it('skips a day where the interviewer has no window for that weekday', () => {
    const other = { y: 2026, m0: 6, d: 18 }           // Saturday
    expect(wd(other.y, other.m0, other.d)).toBe(6)
    const slots = computeSlots([interviewer()], [other], H, H, 0)  // window is for Wed only
    expect(slots).toHaveLength(0)
  })

  it('30-min step yields half-hour-aligned starts', () => {
    const slots = computeSlots([interviewer()], [date], H, 30 * MIN, 0)
    const mins = new Set(slots.map(s => new Date(s.start).getUTCMinutes()))
    expect(Array.from(mins).sort((a, b) => a - b)).toEqual([0, 30])
  })
})
