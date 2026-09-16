// Pure seat arithmetic + close-reason lists. Safe to import from client components.

export const JOB_CLOSE_REASONS = [
  { value: 'filled',           label: 'All seats filled' },
  { value: 'cancelled',        label: 'Cancelled' },
  { value: 'on_hold',          label: 'On hold' },
  { value: 'budget_withdrawn', label: 'Budget withdrawn' },
  { value: 'other',            label: 'Other' },
] as const
export const OPENING_CLOSE_REASONS = [
  { value: 'filled_elsewhere', label: 'Filled another way' },
  { value: 'cancelled',        label: 'Cancelled' },
  { value: 'budget_withdrawn', label: 'Budget withdrawn' },
  { value: 'on_hold',          label: 'On hold' },
  { value: 'duplicate',        label: 'Duplicate' },
  { value: 'other',            label: 'Other' },
] as const
export type JobCloseReason = typeof JOB_CLOSE_REASONS[number]['value']
export type OpeningCloseReason = typeof OPENING_CLOSE_REASONS[number]['value']

export type SeatSummary = { total: number; open: number; filled: number; closed: number; remaining: number }

/** Pure: seat counts from linked openings' statuses. Archived seats don't count. */
export function summarizeSeats(statuses: string[]): SeatSummary {
  const counted = statuses.filter(s => s !== 'archived')
  const filled = counted.filter(s => s === 'filled').length
  const closed = counted.filter(s => s === 'closed').length
  const open   = counted.filter(s => s === 'open').length
  const total  = counted.filter(s => s !== 'closed').length     // seats that can still be, or were, filled
  return { total, open, filled, closed, remaining: Math.max(0, total - filled) }
}

/** Pure: which linked seat a hire should fill — the oldest open one, else oldest approved. */
export function pickSeatToFill(seats: Array<{ id: string; status: string; linked_at: string }>): string | null {
  const byAge = [...seats].sort((a, b) => a.linked_at.localeCompare(b.linked_at))
  return byAge.find(s => s.status === 'open')?.id ?? byAge.find(s => s.status === 'approved')?.id ?? null
}

