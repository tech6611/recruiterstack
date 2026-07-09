import { describe, it, expect } from 'vitest'
import { computeStageDelaySeconds, clampToSendWindow, DEFAULT_SEND_WINDOW, toDelayFields, fromDelayFields } from '../schedule'

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

describe('computeStageDelaySeconds — business days', () => {
  // 2026-07-09 is a Thursday. `from` is 02:00 UTC = 07:30 IST, still Thursday.
  const thu = new Date('2026-07-09T02:00:00.000Z')
  const istDate = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

  it('timed delay skips the weekend (Thu +3 business days → Tue)', () => {
    const secs = computeStageDelaySeconds(
      { send_at_time: '09:00', send_timezone: 'Asia/Kolkata', delay_days: 3, delay_business_days: true },
      thu, false,
    )
    expect(istDate(new Date(thu.getTime() + secs * 1000))).toBe('2026-07-14') // Tuesday
  })

  it('plain calendar days do NOT skip (Thu +3 days → Sun)', () => {
    const secs = computeStageDelaySeconds(
      { send_at_time: '09:00', send_timezone: 'Asia/Kolkata', delay_days: 3, delay_business_days: false },
      thu, false,
    )
    expect(istDate(new Date(thu.getTime() + secs * 1000))).toBe('2026-07-12') // Sunday
  })

  it('relative delay with no fixed time also skips the weekend (3 biz = 5 calendar days)', () => {
    const secs = computeStageDelaySeconds(
      { delay_days: 3, delay_business_days: true, send_timezone: 'Asia/Kolkata' },
      thu, false,
    )
    expect(secs).toBe(5 * 86400)
    expect(istDate(new Date(thu.getTime() + secs * 1000))).toBe('2026-07-14') // Tuesday
  })
})

describe('clampToSendWindow — weekdays 08:00–20:00 IST', () => {
  const w = DEFAULT_SEND_WINDOW

  it('leaves a time already inside the window unchanged', () => {
    const inside = new Date('2026-07-09T10:00:00.000Z') // Thu 15:30 IST
    expect(clampToSendWindow(inside, w).toISOString()).toBe('2026-07-09T10:00:00.000Z')
  })

  it('pushes a too-early time to today 08:00 IST', () => {
    const early = new Date('2026-07-09T01:00:00.000Z') // Thu 06:30 IST
    expect(clampToSendWindow(early, w).toISOString()).toBe('2026-07-09T02:30:00.000Z') // Thu 08:00 IST
  })

  it('pushes a too-late time to the next day 08:00 IST', () => {
    const late = new Date('2026-07-09T16:00:00.000Z') // Thu 21:30 IST
    expect(clampToSendWindow(late, w).toISOString()).toBe('2026-07-10T02:30:00.000Z') // Fri 08:00 IST
  })

  it('pushes a weekend time to Monday 08:00 IST', () => {
    const sat = new Date('2026-07-11T10:00:00.000Z') // Sat 15:30 IST
    expect(clampToSendWindow(sat, w).toISOString()).toBe('2026-07-13T02:30:00.000Z') // Mon 08:00 IST
  })
})

describe('computeStageDelaySeconds — with send window', () => {
  const w = DEFAULT_SEND_WINDOW

  it('delays an immediate off-hours first send to the window open', () => {
    const from = new Date('2026-07-09T01:00:00.000Z') // Thu 06:30 IST → window opens 08:00 IST (+1.5h)
    expect(computeStageDelaySeconds({}, from, true, w)).toBe(5400)
  })

  it('leaves an in-window relative delay untouched', () => {
    const from = new Date('2026-07-09T04:00:00.000Z') // Thu 09:30 IST; +30m → 10:00 IST, inside
    expect(computeStageDelaySeconds({ delay_minutes: 30 }, from, true, w)).toBe(1800)
  })
})

describe('toDelayFields', () => {
  it('minutes → delay_minutes', () => {
    expect(toDelayFields(2, 'minutes')).toEqual({ delay_days: 0, delay_minutes: 2, delay_business_days: false })
  })
  it('hours → delay_minutes × 60', () => {
    expect(toDelayFields(3, 'hours')).toEqual({ delay_days: 0, delay_minutes: 180, delay_business_days: false })
  })
  it('days → delay_days', () => {
    expect(toDelayFields(5, 'days')).toEqual({ delay_days: 5, delay_minutes: 0, delay_business_days: false })
  })
  it('business days → delay_days + flag', () => {
    expect(toDelayFields(4, 'business_days')).toEqual({ delay_days: 4, delay_minutes: 0, delay_business_days: true })
  })
})

describe('fromDelayFields', () => {
  it('round-trips minutes', () => {
    expect(fromDelayFields(0, 2, false)).toEqual({ value: 2, unit: 'minutes' })
  })
  it('reads whole-hour minutes back as hours', () => {
    expect(fromDelayFields(0, 180, false)).toEqual({ value: 3, unit: 'hours' })
  })
  it('keeps non-whole-hour minutes as minutes', () => {
    expect(fromDelayFields(0, 90, false)).toEqual({ value: 90, unit: 'minutes' })
  })
  it('reads days and business days', () => {
    expect(fromDelayFields(5, 0, false)).toEqual({ value: 5, unit: 'days' })
    expect(fromDelayFields(4, 0, true)).toEqual({ value: 4, unit: 'business_days' })
  })
  it('defaults empty to 0 minutes', () => {
    expect(fromDelayFields(0, 0, false)).toEqual({ value: 0, unit: 'minutes' })
  })
})
