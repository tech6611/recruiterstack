// Phone normalization for WhatsApp (Meta Cloud API).
//
// people.phone / candidates.phone are free-text from CV parsers ("+91 98765
// 43210", "(415) 555-0132", "98765-43210"). Meta's wa_id is E.164 digits with
// no '+'. We normalize to '+E164' at the edges and never rewrite stored data.
//
// Pure-regex v1 — upgrade path is libphonenumber-js if country inference
// proves insufficient.

const MIN_E164_DIGITS = 8
const MAX_E164_DIGITS = 15

// Country dialing codes we can sensibly default to when a number has no
// prefix. Keyed by ISO 3166-1 alpha-2.
const COUNTRY_DIAL_CODES: Record<string, string> = {
  IN: '91',
  US: '1',
  GB: '44',
  SG: '65',
  AE: '971',
  AU: '61',
  DE: '49',
  FR: '33',
}

/**
 * Normalize a free-text phone number to E.164 with a leading '+'.
 * Returns null when the input can't plausibly be a phone number.
 *
 * - "+91 98765 43210"  → "+919876543210"
 * - "0091 9876543210"  → "+919876543210"  ('00' international prefix)
 * - "9876543210" + IN  → "+919876543210"  (default country applied)
 * - "9876543210"       → "+9876543210"    (no country — assume already E.164)
 */
export function normalizePhone(raw: string, defaultCountry?: string): string | null {
  if (!raw) return null

  const hasPlus = raw.trim().startsWith('+')
  let digits = raw.replace(/\D/g, '')

  // '00' international dialing prefix → strip (equivalent to '+')
  let hasExplicitCountry = hasPlus
  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2)
    hasExplicitCountry = true
  }

  if (!hasExplicitCountry && defaultCountry) {
    const dial = COUNTRY_DIAL_CODES[defaultCountry.toUpperCase()]
    if (dial && !digits.startsWith(dial)) {
      // National numbers often carry a leading trunk '0' (e.g. UK "07911...")
      const national = digits.replace(/^0+/, '')
      digits = dial + national
    }
  }

  if (digits.length < MIN_E164_DIGITS || digits.length > MAX_E164_DIGITS) return null

  return `+${digits}`
}

/** Strip everything but digits — mirrors the digits_only() SQL helper. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}
