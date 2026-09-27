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

/**
 * GitHub serves any account's portrait at github.com/<login>.png — public, no key, and
 * it follows the person when they change it. A handle is all we need.
 *
 * This is the only photo source we use. LinkedIn photos are behind their authentication
 * and their terms forbid taking them, so nothing here should ever point at LinkedIn.
 */
export function githubAvatarUrl(login: string, size = 160): string | null {
  const handle = (login ?? '').trim().replace(/^@/, '')
  // GitHub logins are alphanumeric with single hyphens; anything else is not a handle.
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(handle)) return null
  return `https://github.com/${handle}.png?size=${size}`
}
