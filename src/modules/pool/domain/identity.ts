/**
 * Identifier normalization for deterministic identity resolution (S1).
 * See docs/pool-vendor-ingestion-architecture.md §2 stage 4.
 *
 * The deterministic tier of resolution: an exact match on a strong identifier is
 * 1:1, no scoring needed. Between two profile-data vendors this carries most of the
 * volume, because both key off the same public professional identity.
 *
 * But "exact" only works on a normalized form. `Foo.Bar+jobs@Gmail.com` and
 * `foobar@gmail.com` are one mailbox; `https://www.linkedin.com/in/asha-rao/?trk=x`
 * and `linkedin.com/in/asha-rao` are one profile. Getting this wrong doesn't throw —
 * it silently creates a duplicate person and quietly pays for them twice.
 *
 * Every function here is PURE and unit-tested, same convention as normalize.ts.
 */
import type { Identifier, IdentifierKind } from '@/modules/pool/vendors/types'

/** A normalized identifier, ready to be looked up or stored. */
export interface NormalizedIdentifier {
  kind: IdentifierKind
  value: string
}

/**
 * Mailbox → comparable form. Lowercased, whitespace and mailto: stripped, `+tag`
 * removed. Gmail dots are also removed, because Gmail ignores them — but ONLY for
 * Gmail: on most other hosts `a.b@` and `ab@` are genuinely different mailboxes,
 * and collapsing them would merge two people. PURE.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^mailto:/, '').replace(/\s+/g, '')
  const at = s.lastIndexOf('@')
  if (at <= 0 || at === s.length - 1) return null
  let local = s.slice(0, at)
  const domain = s.slice(at + 1)
  if (!domain.includes('.')) return null
  local = local.split('+')[0]
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '')
  if (!local) return null
  return `${local}@${domain}`
}

/**
 * LinkedIn profile URL or handle → the bare slug. Handles every shape vendors
 * actually emit: full URLs with or without protocol, country subdomains
 * (in.linkedin.com), trailing slashes, tracking query strings, and a bare handle.
 * Returns the slug only, so all of those compare equal. PURE.
 *
 * Company and school pages are NOT people — returns null rather than minting an
 * identity that would merge everyone who worked somewhere into one person.
 */
export function normalizeLinkedIn(raw: string | null | undefined): string | null {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  s = s.split(/[?#]/)[0]
  s = s.replace(/^https?:\/\//, '').replace(/^[a-z]{2,3}\.linkedin\.com/, 'linkedin.com').replace(/^www\./, '')
  if (/^linkedin\.com\/(company|school|showcase)\//.test(s)) return null
  const m = s.match(/^linkedin\.com\/(?:in|pub)\/([^/]+)/)
  if (m) return decodeURIComponent(m[1]).replace(/\/+$/, '') || null
  // A bare handle, e.g. "asha-rao". Reject anything that still looks like a URL.
  if (/[/.\s@]/.test(s)) return null
  return decodeURIComponent(s) || null
}

/** GitHub profile URL or login → the bare login. PURE. */
export function normalizeGithub(raw: string | null | undefined): string | null {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  s = s.split(/[?#]/)[0].replace(/^https?:\/\//, '').replace(/^www\./, '')
  const m = s.match(/^github\.com\/([^/]+)/)
  if (m) s = m[1]
  s = s.replace(/^@/, '').replace(/\/+$/, '')
  if (!s || /[/.\s@]/.test(s)) return null
  return s
}

/**
 * Phone → E.164-ish digits with a leading '+'. `defaultCc` is applied only to a
 * number that carries no country code and has the right national length — we would
 * rather return null than invent a country and merge two strangers. PURE.
 */
export function normalizePhone(raw: string | null | undefined, defaultCc = '91'): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const hadPlus = s.trimStart().startsWith('+') || s.startsWith('00')
  const digits = s.replace(/\D/g, '').replace(/^00/, '')
  if (digits.length < 7 || digits.length > 15) return null
  if (hadPlus) return `+${digits}`
  // India: 10 national digits, or 11 with the trunk '0', or 12 already carrying 91.
  if (defaultCc === '91') {
    if (digits.length === 10) return `+91${digits}`
    if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
    return null
  }
  return `+${defaultCc}${digits}`
}

const NORMALIZERS: Record<IdentifierKind, (v: string) => string | null> = {
  email: normalizeEmail,
  linkedin: normalizeLinkedIn,
  github: normalizeGithub,
  phone: (v) => normalizePhone(v),
}

/**
 * Normalize a mapped record's identifiers, dropping any that don't survive, and
 * de-duplicating. Order is preserved so the strongest identifier a vendor gave us
 * stays first. PURE.
 */
export function normalizeIdentifiers(ids: Identifier[]): NormalizedIdentifier[] {
  const out: NormalizedIdentifier[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const value = NORMALIZERS[id.kind]?.(id.value)
    if (!value) continue
    const key = `${id.kind}:${value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind: id.kind, value })
  }
  return out
}

/**
 * Which identifier kinds are stored as pool_contacts rows (and so are the lookup
 * index for cross-source resolution). `github` is not a contact — it lives in
 * pool_identities under the 'github' source.
 */
export const CONTACT_IDENTIFIER_KINDS: IdentifierKind[] = ['email', 'linkedin', 'phone']
