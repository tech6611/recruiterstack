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
): number {
  const fromMs = from.getTime()

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
    let targetFakeUtc = Date.UTC(tzYear, tzMonth, tzDay + extraDays, targetH, targetM, 0)

    // If the target time already passed today and there's no explicit day delay,
    // push to tomorrow.
    const targetRealUtc = targetFakeUtc + tzOffsetMs
    if (targetRealUtc <= fromMs && extraDays === 0) {
      targetFakeUtc += 86_400_000
    }

    return Math.max(0, Math.round((targetFakeUtc + tzOffsetMs - fromMs) / 1000))
  }

  const daySeconds = (stage.delay_days ?? 0) * 86400
  const minSeconds = (stage.delay_minutes ?? 0) * 60
  if (isFirst && daySeconds === 0 && minSeconds === 0) return 0
  return Math.max(daySeconds + minSeconds, isFirst ? 0 : 60)
}
