// Shared time-window presets for sequence funnel views (on-screen list, per-
// sequence analytics, and the CSV export). Keeping the mapping in one place means
// the download and the on-screen numbers always agree on what "Last 30 days" means.

export const RANGE_DAYS: Record<string, number | null> = {
  '7d':  7,
  '30d': 30,
  '90d': 90,
  'all': null,
}

export const DEFAULT_RANGE = '30d'

// Labels for the dropdowns (client-side). Order defines display order.
export const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: '7d',  label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

/** Resolve a range key to a cutoff Date (or null for all-time). Unknown → 30d. */
export function rangeToSince(range: string | null | undefined): Date | null {
  const key = range && range in RANGE_DAYS ? range : DEFAULT_RANGE
  const days = RANGE_DAYS[key]
  return days === null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

// A resolved time window. `since`/`until` are inclusive bounds (either can be
// null = open-ended). Presets only ever set `since`; a custom range can set both.
export interface TimeWindow {
  since: Date | null
  until: Date | null
}

// Parse a "YYYY-MM-DD" date input. Start dates anchor to 00:00:00 UTC; end dates
// anchor to 23:59:59.999 UTC so the whole chosen day is included.
function parseDay(value: string | null | undefined, endOfDay: boolean): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const ms = Date.UTC(+y, +mo - 1, +d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  return Number.isNaN(ms) ? null : new Date(ms)
}

// Resolve the request's time window. `range === 'custom'` uses the start/end date
// strings; any other value falls back to the preset cutoff (with no upper bound).
export function resolveWindow(
  range: string | null | undefined,
  start?: string | null,
  end?: string | null,
): TimeWindow {
  if (range === 'custom') {
    return { since: parseDay(start, false), until: parseDay(end, true) }
  }
  return { since: rangeToSince(range), until: null }
}

// True when an ISO timestamp falls within [since, until] (inclusive, open-ended
// when a bound is null). A null/blank timestamp is treated as outside any bounded
// window, matching the funnel rollups that only count rows with real timestamps.
export function inWindow(iso: string | null, w: TimeWindow): boolean {
  if (!w.since && !w.until) return true
  const v = iso ?? ''
  if (w.since && v < w.since.toISOString()) return false
  if (w.until && (v === '' || v > w.until.toISOString())) return false
  return true
}
