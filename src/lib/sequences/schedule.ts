/**
 * Sequence stage scheduling — shared by the enroll route (first stage) and the
 * sequence_email job handler (each subsequent stage). Keeping the delay maths in
 * one place ensures both entry points schedule stages identically.
 */

/** Stage timing fields relevant to when a stage should send. */
export interface StageTiming {
  send_at?: string | null
  send_at_time?: string | null
  send_timezone?: string | null
  delay_days?: number | null
  delay_minutes?: number | null
  delay_business_days?: boolean | null
}

// ── Send window (business-hours guardrail) ────────────────────────────────────
// A safety net so outreach never fires at 3am or on a weekend — bad for
// deliverability and it reads as spam. Applied only to relative-delay steps
// (including "send immediately"): if a step would land outside the window, it is
// pushed forward to the next window open. Steps with an explicit clock time
// (send_at / send_at_time) are left alone — the user picked that moment on purpose.

export interface SendWindow {
  timezone: string     // IANA tz the window hours are expressed in
  startHour: number    // inclusive, 0–23 (earliest send)
  endHour: number      // exclusive, 0–23 (first hour that's too late)
  days: number[]       // allowed weekdays, 0=Sun … 6=Sat
}

// Platform default: weekdays, 8am–8pm India time. Kept generous so it only trims
// the genuinely antisocial hours.
export const DEFAULT_SEND_WINDOW: SendWindow = {
  timezone: 'Asia/Kolkata',
  startHour: 8,
  endHour: 20,
  days: [1, 2, 3, 4, 5],
}

interface TzParts {
  year: number; month: number; day: number; hour: number; minute: number; second: number; dow: number
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Wall-clock components of `date` as seen in `tz`. */
function tzParts(date: Date, tz: string): TzParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)!.value
  return {
    year: +get('year'), month: +get('month') - 1, day: +get('day'),
    hour: +get('hour') % 24, minute: +get('minute'), second: +get('second'),
    dow: WEEKDAY_INDEX[get('weekday')],
  }
}

/** Real UTC Date for a desired wall-clock (y,mo,d,h,m) in `tz`, using the tz
 *  offset measured at `reference`. */
function realDateFromLocal(y: number, mo: number, d: number, h: number, m: number, tz: string, reference: Date): Date {
  const rp = tzParts(reference, tz)
  const refFakeUtc = Date.UTC(rp.year, rp.month, rp.day, rp.hour, rp.minute, rp.second)
  const offset = reference.getTime() - refFakeUtc
  return new Date(Date.UTC(y, mo, d, h, m, 0) + offset)
}

/**
 * Return the first instant >= `target` that falls inside the send window. If
 * `target` is already inside, it's returned unchanged.
 */
export function clampToSendWindow(target: Date, window: SendWindow): Date {
  let cur = target
  for (let i = 0; i < 14; i++) {
    const p = tzParts(cur, window.timezone)
    const dayOk = window.days.includes(p.dow)
    if (dayOk && p.hour >= window.startHour && p.hour < window.endHour) return cur

    if (dayOk && p.hour < window.startHour) {
      // Too early today — jump to today's opening time.
      cur = realDateFromLocal(p.year, p.month, p.day, window.startHour, 0, window.timezone, cur)
    } else {
      // Too late, or a non-sending day — jump to the next calendar day's opening
      // time; the loop re-checks whether that day is allowed.
      const next = new Date(Date.UTC(p.year, p.month, p.day) + 86_400_000)
      cur = realDateFromLocal(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), window.startHour, 0, window.timezone, cur)
    }
  }
  return cur
}

/**
 * Add `n` business days (Mon–Fri, skipping Sat/Sun) to a calendar date, returning
 * the resulting {year, month, day}. `month` is 0-indexed (JS convention). The
 * landing day is always itself a weekday. Weekday math is done in UTC so it is
 * independent of the host machine's timezone.
 */
function addBusinessDays(year: number, month: number, day: number, n: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month, day))
  let added = 0
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) added++ // 0 = Sunday, 6 = Saturday
  }
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
}

/**
 * Seconds from `from` until this stage should send.
 *
 * Precedence:
 *  - `send_at`      — absolute datetime override (send at this exact moment)
 *  - `send_at_time` — time-of-day in `send_timezone` (next occurrence, +delay_days)
 *  - else           — relative delay: delay_days + delay_minutes from `from`
 *
 * `isFirst` allows a 0-second (immediate) result for the very first stage of an
 * enrollment. Later stages get a minimum 60s gap so a zero-delay follow-up does
 * not collapse into the same queue batch as the stage that scheduled it.
 */
export function computeStageDelaySeconds(
  stage: StageTiming,
  from: Date,
  isFirst: boolean,
  window?: SendWindow | null,
): number {
  const fromMs = from.getTime()

  // Push a computed relative delay forward if it lands outside the send window.
  const applyWindow = (seconds: number): number => {
    if (!window) return seconds
    const target = new Date(fromMs + seconds * 1000)
    const clamped = clampToSendWindow(target, window)
    return Math.max(0, Math.round((clamped.getTime() - fromMs) / 1000))
  }

  if (stage.send_at) {
    const sendAtMs = new Date(stage.send_at).getTime()
    return Math.max(0, Math.round((sendAtMs - fromMs) / 1000))
  }

  if (stage.send_at_time) {
    // Time-of-day scheduling: "send at HH:MM in timezone", computed via Intl so
    // it is correct regardless of the server's own timezone.
    const tz = stage.send_timezone || 'Asia/Kolkata'
    const [targetH, targetM] = stage.send_at_time.split(':').map(Number)

    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const parts = fmt.formatToParts(from)
    const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value)
    const tzYear = get('year'), tzMonth = get('month') - 1, tzDay = get('day')
    const tzHour = get('hour'), tzMinute = get('minute')

    // realUTC = fakeUTC + offset
    const nowFakeUtc = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, 0)
    const tzOffsetMs = fromMs - nowFakeUtc

    const extraDays = stage.delay_days ?? 0
    const businessDays = !!stage.delay_business_days

    // The target calendar day = today-in-tz + the delay. For business-day delays
    // we step over weekends; otherwise it's a plain calendar add.
    const target = businessDays && extraDays > 0
      ? addBusinessDays(tzYear, tzMonth, tzDay, extraDays)
      : { year: tzYear, month: tzMonth, day: tzDay + extraDays }
    let targetFakeUtc = Date.UTC(target.year, target.month, target.day, targetH, targetM, 0)

    // If the target time already passed today and there's no explicit day delay,
    // push to the next day — the next *business* day when this is a business-day step.
    const targetRealUtc = targetFakeUtc + tzOffsetMs
    if (targetRealUtc <= fromMs && extraDays === 0) {
      const next = businessDays
        ? addBusinessDays(target.year, target.month, target.day, 1)
        : { year: target.year, month: target.month, day: target.day + 1 }
      targetFakeUtc = Date.UTC(next.year, next.month, next.day, targetH, targetM, 0)
    }

    return Math.max(0, Math.round((targetFakeUtc + tzOffsetMs - fromMs) / 1000))
  }

  const delayDays = stage.delay_days ?? 0
  const minSeconds = (stage.delay_minutes ?? 0) * 60

  // Business-day relative delay (no fixed clock time): convert N business days
  // into the calendar-day span from `from`'s date (in the stage timezone), so a
  // Thu + "3 business days" lands the following Tue, not Sun.
  if (stage.delay_business_days && delayDays > 0) {
    const tz = stage.send_timezone || 'Asia/Kolkata'
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
    }).formatToParts(from)
    const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value)
    const y = get('year'), mo = get('month') - 1, d = get('day')
    const target = addBusinessDays(y, mo, d, delayDays)
    const calDays = Math.round((Date.UTC(target.year, target.month, target.day) - Date.UTC(y, mo, d)) / 86_400_000)
    return applyWindow(Math.max(calDays * 86400 + minSeconds, isFirst ? 0 : 60))
  }

  const daySeconds = delayDays * 86400
  if (isFirst && daySeconds === 0 && minSeconds === 0) return applyWindow(0)
  return applyWindow(Math.max(daySeconds + minSeconds, isFirst ? 0 : 60))
}

// ── Delay unit ↔ stored fields ────────────────────────────────────────────────
// The step editor lets a user pick an amount + unit (minutes/hours/days). We
// store only delay_days + delay_minutes (+ delay_business_days), so these map a
// UI amount/unit to those columns and back. Hours are stored as minutes×60.

export type DelayUnit = 'minutes' | 'hours' | 'days' | 'business_days'

export function toDelayFields(value: number, unit: DelayUnit): {
  delay_days: number; delay_minutes: number; delay_business_days: boolean
} {
  const v = Math.max(0, Math.floor(value || 0))
  switch (unit) {
    case 'minutes':       return { delay_days: 0, delay_minutes: v,      delay_business_days: false }
    case 'hours':         return { delay_days: 0, delay_minutes: v * 60, delay_business_days: false }
    case 'days':          return { delay_days: v, delay_minutes: 0,      delay_business_days: false }
    case 'business_days': return { delay_days: v, delay_minutes: 0,      delay_business_days: true  }
  }
}

export function fromDelayFields(
  delayDays: number, delayMinutes: number, businessDays: boolean,
): { value: number; unit: DelayUnit } {
  if (delayDays > 0) return { value: delayDays, unit: businessDays ? 'business_days' : 'days' }
  if (delayMinutes > 0 && delayMinutes % 60 === 0) return { value: delayMinutes / 60, unit: 'hours' }
  if (delayMinutes > 0) return { value: delayMinutes, unit: 'minutes' }
  return { value: 0, unit: 'minutes' }
}
