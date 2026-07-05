import { describe, it, expect } from 'vitest'
import { computeStageDelaySeconds } from '../schedule'

describe('computeStageDelaySeconds', () => {
  // 10:00 UTC == 15:30 in Asia/Kolkata (IST, +5:30)
  const from = new Date('2026-07-05T10:00:00.000Z')

  it('first stage with no delay sends immediately', () => {
    expect(computeStageDelaySeconds({}, from, true)).toBe(0)
  })

  it('non-first stage with no delay gets a 60s minimum gap', () => {
    expect(computeStageDelaySeconds({}, from, false)).toBe(60)
  })

  it('applies a relative delay of days + minutes from `from`', () => {
    expect(computeStageDelaySeconds({ delay_days: 1, delay_minutes: 30 }, from, false))
      .toBe(86400 + 30 * 60)
  })

  it('honours a non-zero relative delay even on the first stage', () => {
    expect(computeStageDelaySeconds({ delay_minutes: 5 }, from, true)).toBe(5 * 60)
  })

  it('uses send_at as an absolute datetime override', () => {
    const sendAt = new Date(from.getTime() + 3600_000).toISOString() // +1h
    expect(computeStageDelaySeconds({ send_at: sendAt }, from, false)).toBe(3600)
  })

  it('clamps a past send_at to 0 (send now)', () => {
    const past = new Date(from.getTime() - 3600_000).toISOString()
    expect(computeStageDelaySeconds({ send_at: past }, from, false)).toBe(0)
  })

  it('schedules a send_at_time still ahead today, later today', () => {
    // 18:00 IST == 12:30 UTC; from is 10:00 UTC → 2.5h away
    expect(computeStageDelaySeconds(
      { send_at_time: '18:00', send_timezone: 'Asia/Kolkata' }, from, false,
    )).toBe(9000)
  })

  it('rolls a send_at_time that already passed today to tomorrow', () => {
    // 09:00 IST already passed (it is 15:30 IST) → tomorrow 09:00 IST == 03:30 UTC next day
    expect(computeStageDelaySeconds(
      { send_at_time: '09:00', send_timezone: 'Asia/Kolkata' }, from, false,
    )).toBe(63000)
  })
})
