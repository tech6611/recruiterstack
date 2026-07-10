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
