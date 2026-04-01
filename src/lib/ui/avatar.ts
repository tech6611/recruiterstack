/**
 * Shared avatar color and initials utilities.
 * Consolidates duplicated code from 3+ files.
 */

export const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
]

/** Deterministic color from a name string */
export function avatarColor(name: string): string {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** First two initials from a full name — "John Doe" → "JD" */
export function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}
