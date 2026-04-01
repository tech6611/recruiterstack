/**
 * Shared date formatting utilities.
 * Consolidates duplicated timeAgo/fmtRelative/fmtDate functions from 12+ files.
 */

/** Compact relative time — "just now", "3m ago", "2h ago", "5d ago", "3w ago", "1y ago" */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  const wks = Math.floor(days / 7)
  return wks < 52 ? `${wks}w ago` : `${Math.floor(wks / 52)}y ago`
}

/** Human-friendly relative — "Today", "Yesterday", "3d ago", "2w ago", "4mo ago", "1y ago" */
export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)   return `${days}d ago`
  if (days < 30)  return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/** Short date — "Jan 15, 2025" */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

/** Date with time — "Jan 15, 2025, 2:30 PM" */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

/** Short date without year — "Jan 15" */
export function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}
