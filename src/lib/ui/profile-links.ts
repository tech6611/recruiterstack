/**
 * The row of source icons at the top-right of a profile — LinkedIn, GitHub, X, a
 * personal site — the way Juicebox opens a candidate.
 *
 * THE HOST DECIDES, NOT THE LABEL. Our contact rows carry a `kind` written by whoever
 * imported them, and it lies often: a GitHub profile arrives as kind `website`, a
 * personal domain arrives as `linkedin` when a vendor guessed. A URL's host is a fact,
 * so that is what is read. The stored kind is only a fallback for the rows that have no
 * URL at all (email, phone).
 *
 * THE ORDER IS FIXED, which is the entire point of a header block. If the icons
 * reshuffled per candidate — LinkedIn first for one person, a globe first for the next —
 * a recruiter would have to read the row instead of recognising it. Sorting by
 * `NETWORK_ORDER` means the LinkedIn icon is always in the same place when it exists.
 *
 * PURE. No React, no I/O; the component maps a network name to a mark.
 */

/** Networks we can name honestly. Anything else is a `website`. */
export type LinkNetwork = 'linkedin' | 'github' | 'x' | 'website' | 'email' | 'phone' | 'resume'

export interface ProfileLink {
  network: LinkNetwork
  /** Tooltip and aria-label — the actual destination, not the word "Link". */
  label: string
  href: string
}

/** Left to right. A header only reads as a header if it is in the same order every time. */
const NETWORK_ORDER: LinkNetwork[] = ['linkedin', 'github', 'x', 'website', 'resume', 'email', 'phone']

/** Host → network. Checked against the hostname, so a path can never fake a match. */
const HOSTS: [RegExp, LinkNetwork][] = [
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)github\.(com|io)$/i, 'github'],
  [/(^|\.)(twitter\.com|x\.com)$/i, 'x'],
]

function hostOf(value: string): string | null {
  try {
    // A bare "example.com" is not a URL to `new URL`, but it is plainly a site.
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.replace(/^www\./i, '') : null
  } catch {
    return null
  }
}

/**
 * One contact row → a header link, or null when it is not something to link to.
 *
 * A value that is neither a URL nor a recognised kind is dropped rather than shown as a
 * globe: an icon that goes nowhere is worse than an icon that is absent.
 */
export function classifyContact(kind: string | null | undefined, value: string | null | undefined): ProfileLink | null {
  const v = (value ?? '').trim()
  if (!v) return null
  const k = (kind ?? '').toLowerCase()

  if (k === 'email' || (!k && v.includes('@') && !v.includes('/'))) {
    return v.includes('@') ? { network: 'email', label: v, href: `mailto:${v}` } : null
  }
  if (k === 'phone' || k === 'mobile') {
    return { network: 'phone', label: v, href: `tel:${v.replace(/[^\d+]/g, '')}` }
  }

  const host = hostOf(v)
  if (!host) return null
  const href = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  const network = HOSTS.find(([re]) => re.test(host))?.[1] ?? 'website'
  const label =
    network === 'linkedin' ? 'LinkedIn profile'
    : network === 'github' ? 'GitHub profile'
    : network === 'x' ? 'X profile'
    : host
  return { network, label, href }
}

/**
 * Every link a profile has, deduplicated and in the fixed order.
 *
 * Deduplicated by NETWORK, not by URL: two LinkedIn rows from two vendors are one
 * LinkedIn icon, and a row of three identical marks would say nothing about the person.
 * The first of each wins, so callers pass their most trusted source first.
 */
export function profileLinks(
  contacts: { kind?: string | null; value?: string | null }[] | null | undefined,
): ProfileLink[] {
  const seen = new Map<LinkNetwork, ProfileLink>()
  for (const c of contacts ?? []) {
    const link = classifyContact(c?.kind, c?.value)
    if (link && !seen.has(link.network)) seen.set(link.network, link)
  }
  return NETWORK_ORDER.map((n) => seen.get(n)).filter((l): l is ProfileLink => Boolean(l))
}
