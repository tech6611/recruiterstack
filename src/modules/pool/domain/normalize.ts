/**
 * Location + company normalization for the pool (E1 in the enrichment pipeline).
 *
 * Pure and unit-tested, same convention as candidate-enrichment.ts. This is the
 * cheapest step in the pipeline and the one that decides whether the city filter
 * works at all: 1,500 GitHub profiles produced 91 distinct spellings of one city,
 * and a CV folder added misspellings on top ("Banglore, India").
 */

const CITY_ALIASES: Record<string, string[]> = {
  Bengaluru:   ['bengaluru', 'bangalore', 'bengalooru', 'bangaluru', 'blr', 'bengaluru city'],
  Mumbai:      ['mumbai', 'bombay', 'navi mumbai', 'thane'],
  'Delhi NCR': ['delhi', 'new delhi', 'gurgaon', 'gurugram', 'noida', 'ghaziabad', 'faridabad', 'ncr'],
  Hyderabad:   ['hyderabad', 'secunderabad', 'hyd'],
  Pune:        ['pune', 'pimpri', 'chinchwad'],
  Chennai:     ['chennai', 'madras'],
  Kolkata:     ['kolkata', 'calcutta'],
  Ahmedabad:   ['ahmedabad', 'gandhinagar'],
  Jaipur:      ['jaipur'],
  Kochi:       ['kochi', 'cochin', 'ernakulam'],
  Mangaluru:   ['mangaluru', 'mangalore'],
  Coimbatore:  ['coimbatore'],
  Indore:      ['indore'],
  Chandigarh:  ['chandigarh', 'mohali', 'panchkula'],
  Bhubaneswar: ['bhubaneswar', 'bhubaneshwar'],
  Trivandrum:  ['trivandrum', 'thiruvananthapuram'],
}

/** Movement markers: "Kolkata → Bangalore" means they ended up in Bangalore. */
const MOVED = /(→|->|=>|✈|➜|»|\bnow in\b|\bmoved to\b|\brelocated to\b)/i

const flat: { canon: string; alias: string }[] = []
for (const [canon, aliases] of Object.entries(CITY_ALIASES)) {
  for (const alias of aliases) flat.push({ canon, alias })
}

/** Strip accents/punctuation, collapse whitespace, lowercase. PURE. */
export function slugifyPlace(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Levenshtein distance, capped for early exit. PURE. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < best) best = curr[j]
    }
    if (best > cap) return cap + 1
    prev = curr
  }
  return prev[b.length]
}

/**
 * Free-text location → a canonical city, or null when nothing is recognised.
 *
 * Handles exact aliases, misspellings within one edit for short names and two for
 * longer ones ("banglore" → Bengaluru), and multi-city strings. For those, a
 * movement marker means the LAST city wins ("Kolkata ✈ Bangalore" → Bengaluru);
 * otherwise the FIRST wins, because "City, State, Country" is the common shape.
 * PURE.
 */
export function normalizeCity(raw: string | null | undefined): string | null {
  const s = slugifyPlace(String(raw ?? ''))
  if (!s) return null

  const hits: { canon: string; at: number }[] = []
  for (const { canon, alias } of flat) {
    const at = s.indexOf(alias)
    if (at >= 0) hits.push({ canon, at })
  }
  if (!hits.length) {
    // No exact alias — try fuzzy, token by token.
    const tokens = s.split(' ').filter((t) => t.length >= 4)
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      for (const { canon, alias } of flat) {
        if (alias.includes(' ') || alias.length < 4) continue
        const cap = alias.length >= 7 ? 2 : 1
        if (editDistance(token, alias, cap) <= cap) hits.push({ canon, at: i })
      }
    }
  }
  if (!hits.length) return null

  const distinct = Array.from(new Set(hits.map((h) => h.canon)))
  if (distinct.length === 1) return distinct[0]

  hits.sort((a, b) => a.at - b.at)
  return MOVED.test(String(raw ?? '')) ? hits[hits.length - 1].canon : hits[0].canon
}

const LEGAL =
  /\b(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|technologies|technology|labs?|solutions?|services?|systems?|software|india)\b\.?/gi

/**
 * Free-text employer → a comparable company name. Strips the GitHub `@handle`
 * convention, legal suffixes and trailing role text. PURE.
 */
export function normalizeCompany(raw: string | null | undefined): string | null {
  let s = String(raw ?? '').trim()
  if (!s) return null
  s = s.replace(/^@+/, '')
  s = s.split(/\s*[|/,]\s*|\s+-\s+|\s+—\s+/)[0]
  s = s.replace(LEGAL, '')
  s = s.replace(/[^a-z0-9&.\s+-]/gi, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/[.\-\s]+$/, '').trim()
  return s || null
}
