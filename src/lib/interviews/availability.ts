/**
 * Interview availability engine.
 *
 * Computes the bookable slots a candidate can pick from a self-schedule link:
 *
 *     open slots = next N business days
 *                  ∩ each interviewer's preferred hours (in their own timezone)
 *                  ∩ each interviewer's real calendar free/busy
 *
 * For a panel, a slot is open only if it fits EVERY interviewer's preferred
 * hours and EVERY interviewer is free.
 *
 * No timezone library is available, so wall-clock ↔ UTC conversion is done with
 * Intl (same technique as src/lib/sequences/schedule.ts). The pure helpers are
 * exported for unit testing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getInterviewerPreferences,
  DEFAULT_TIMEZONE,
  DEFAULT_WINDOWS,
  type AvailabilityWindow,
} from '@/modules/ats/domain/interviewer-preferences'
import { getBusyForEmails } from '@/lib/interviews/busy'

export interface Interval { start: number; end: number }  // epoch ms
export interface OpenSlot { start: string; end: string }   // ISO UTC

// ── Timezone helpers ──────────────────────────────────────────────────────────

/** Offset (ms) such that: wallClockRenderedInTz(utcMs) - utcMs. e.g. IST → +19800000. */
function tzOffsetMsAt(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value)
  let hour = get('hour')
  if (hour === 24) hour = 0  // some engines render midnight as 24
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return wallAsUtc - utcMs
}

/** Real UTC ms for a wall-clock time (minutes-from-midnight) on a date in `tz`. */
export function zonedWallClockToUtcMs(tz: string, y: number, m0: number, d: number, minutes: number): number {
  const fakeUtc = Date.UTC(y, m0, d, Math.floor(minutes / 60), minutes % 60, 0)
  // Offset depends on the real instant; approximating with fakeUtc is exact
  // except within a ~1h DST-transition window, which business hours rarely hit.
  const off = tzOffsetMsAt(tz, fakeUtc)
  return fakeUtc - off
}

/** Weekday (0=Sun..6=Sat) of a calendar date — the same worldwide. */
function weekdayOf(y: number, m0: number, d: number): number {
  return new Date(Date.UTC(y, m0, d)).getUTCDay()
}

/** The next `count` business days (Mon–Fri) as calendar dates in `refTz`, today inclusive. */
export function nextBusinessDays(refTz: string, count: number, nowMs: number): { y: number; m0: number; d: number }[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: refTz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(nowMs))
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value)

  const cur = new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
  const out: { y: number; m0: number; d: number }[] = []
  while (out.length < count) {
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push({ y: cur.getUTCFullYear(), m0: cur.getUTCMonth(), d: cur.getUTCDate() })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

// ── Interval math ─────────────────────────────────────────────────────────────

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(i => i.end > i.start).sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end)
    else out.push({ ...iv })
  }
  return out
}

export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let result = mergeIntervals(base)
  for (const c of mergeIntervals(cut)) {
    const next: Interval[] = []
    for (const b of result) {
      if (c.end <= b.start || c.start >= b.end) { next.push(b); continue }  // no overlap
      if (c.start > b.start) next.push({ start: b.start, end: c.start })
      if (c.end < b.end)     next.push({ start: c.end, end: b.end })
    }
    result = next
  }
  return result
}

function intersectTwo(a: Interval[], b: Interval[]): Interval[] {
  const A = mergeIntervals(a), B = mergeIntervals(b)
  const out: Interval[] = []
  let i = 0, j = 0
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start)
    const end   = Math.min(A[i].end, B[j].end)
    if (end > start) out.push({ start, end })
    if (A[i].end < B[j].end) i++; else j++
  }
  return out
}

export function intersectMany(lists: Interval[][]): Interval[] {
  if (lists.length === 0) return []
  let acc = mergeIntervals(lists[0])
  for (let k = 1; k < lists.length; k++) {
    acc = intersectTwo(acc, lists[k])
    if (acc.length === 0) break
  }
  return acc
}

// ── Slot generation ───────────────────────────────────────────────────────────

export interface InterviewerAvailability {
  email:    string
  timezone: string
  windows:  AvailabilityWindow[]
  busy:     Interval[]
}

/**
 * Pure slot computation. For each business date, each interviewer's preferred
 * windows for that weekday (in their tz) minus their busy time; the panel's
 * joint availability is the intersection; slots are emitted on a `stepMs` grid
 * aligned to the epoch (→ :00/:30 in whole/half-hour timezones), no earlier than
 * `earliestStartMs`, each `durationMs` long and fully inside a joint interval.
 */
export function computeSlots(
  interviewers: InterviewerAvailability[],
  businessDates: { y: number; m0: number; d: number }[],
  durationMs: number,
  stepMs: number,
  earliestStartMs: number,
): Interval[] {
  if (interviewers.length === 0 || durationMs <= 0 || stepMs <= 0) return []

  const slots: Interval[] = []
  for (const date of businessDates) {
    const wd = weekdayOf(date.y, date.m0, date.d)

    const perInterviewer: Interval[][] = interviewers.map(iv => {
      const windows = iv.windows.filter(w => w.day === wd)
      if (windows.length === 0) return []
      const avail = windows.map(w => ({
        start: zonedWallClockToUtcMs(iv.timezone, date.y, date.m0, date.d, w.start),
        end:   zonedWallClockToUtcMs(iv.timezone, date.y, date.m0, date.d, w.end),
      }))
      return subtractIntervals(avail, iv.busy)
    })

    for (const interval of intersectMany(perInterviewer)) {
      const from = Math.max(interval.start, earliestStartMs)
      let s = Math.ceil(from / stepMs) * stepMs
      for (; s + durationMs <= interval.end; s += stepMs) {
        slots.push({ start: s, end: s + durationMs })
      }
    }
  }

  slots.sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const sl of slots) if (!out.length || out[out.length - 1].start !== sl.start) out.push(sl)
  return out
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export interface ComputeOpenSlotsOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  orgId: string
  emails: string[]
  durationMinutes: number
  businessDayCount?: number   // default 7
  stepMinutes?: number        // default 30
  minLeadMinutes?: number     // default 120 (don't offer slots < 2h away)
  now?: Date
}

/**
 * End-to-end: load interviewer preferences + calendar busy, then compute the
 * open slots over the next N business days.
 */
export async function computeOpenSlots(opts: ComputeOpenSlotsOptions): Promise<{
  slots: OpenSlot[]
  businessDayCount: number
  interviewerCount: number
  /** False when the org has no calendar connected — slots are stated-hours only. */
  calendarChecked: boolean
}> {
  const businessDayCount = opts.businessDayCount ?? 7
  const stepMinutes      = opts.stepMinutes ?? 30
  const minLeadMinutes   = opts.minLeadMinutes ?? 120
  const nowMs            = (opts.now ?? new Date()).getTime()

  const emails = Array.from(new Set(opts.emails.map(e => e.trim().toLowerCase()).filter(Boolean)))
  if (emails.length === 0) return { slots: [], businessDayCount, interviewerCount: 0, calendarChecked: false }

  const prefs = await getInterviewerPreferences(opts.supabase, opts.orgId, emails)
  const refTz = prefs[emails[0]]?.timezone || DEFAULT_TIMEZONE
  const businessDates = nextBusinessDays(refTz, businessDayCount, nowMs)

  // Busy window: now → midnight after the last business day (ref tz).
  const last = businessDates[businessDates.length - 1]
  const rangeEndMs = zonedWallClockToUtcMs(refTz, last.y, last.m0, last.d, 24 * 60)
  const { busy, calendarConnected } = await getBusyForEmails(
    opts.supabase, opts.orgId, emails,
    new Date(nowMs).toISOString(), new Date(rangeEndMs).toISOString(),
  )

  const interviewers: InterviewerAvailability[] = emails.map(email => ({
    email,
    timezone: prefs[email]?.timezone || DEFAULT_TIMEZONE,
    windows:  prefs[email]?.windows?.length ? prefs[email].windows : DEFAULT_WINDOWS,
    busy:     (busy[email] ?? []).map(b => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() })),
  }))

  const slots = computeSlots(
    interviewers,
    businessDates,
    opts.durationMinutes * 60_000,
    stepMinutes * 60_000,
    nowMs + minLeadMinutes * 60_000,
  )

  return {
    slots: slots.map(s => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })),
    businessDayCount,
    interviewerCount: emails.length,
    calendarChecked: calendarConnected,
  }
}
