/**
 * Company logos, fetched on the fly from Clearbit's public logo endpoint
 * (https://logo.clearbit.com/<domain>) — no API key, no storage. We only have a
 * company NAME, so we guess its domain; the <CompanyLogo> component falls back to a
 * coloured initial when the guess 404s. Prototype-grade by design: reliable for the
 * well-known employers a persona targets, gracefully degraded for the long tail.
 * When the pool grows and we store real company records, swap the guess for a
 * stored domain and this whole file becomes a one-line lookup.
 */

/** Names whose domain a bare-slug + ".com" guess would get wrong. */
const KNOWN_DOMAINS: Record<string, string> = {
  notion: 'notion.so',
  ramp: 'ramp.com',
  rippling: 'rippling.com',
  clay: 'clay.com',
  x: 'x.com',
  meta: 'meta.com',
  alphabet: 'abc.xyz',
}

/** Legal-form and generic suffixes that aren't part of the domain. */
const SUFFIXES = /\b(inc|llc|ltd|limited|corp|corporation|company|technologies|technology|labs|software|systems|solutions|group|holdings|the)\b/gi

/** Best-effort domain from a company name. Null when nothing usable remains. */
export function companyDomainGuess(name: string): string | null {
  const raw = (name ?? '').trim().toLowerCase()
  if (!raw) return null
  const bare = raw
    .replace(/&/g, ' and ')
    .replace(SUFFIXES, ' ')
    .replace(/[^a-z0-9]/g, '')
  if (!bare) return null
  return KNOWN_DOMAINS[bare] ?? `${bare}.com`
}

/** Clearbit logo URL for a company name, or null when no domain can be guessed. */
export function companyLogoUrl(name: string): string | null {
  const domain = companyDomainGuess(name)
  return domain ? `https://logo.clearbit.com/${domain}` : null
}

/** 1–2 letter fallback badge, e.g. "Stripe" → "S", "Palo Alto Networks" → "PA". */
export function companyInitials(name: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
