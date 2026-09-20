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
  // ── International hubs (the markets jobs are posted in) ──
  'New York':      ['new york', 'new york city', 'nyc', 'manhattan', 'brooklyn', 'new york metropolitan area', 'greater new york'],
  'San Francisco': ['san francisco', 'sf bay area', 'san francisco bay area', 'bay area', 'palo alto', 'mountain view', 'menlo park', 'south san francisco'],
  'Los Angeles':   ['los angeles', 'santa monica', 'greater los angeles'],
  Seattle:         ['seattle', 'bellevue', 'redmond'],
  Boston:          ['boston', 'cambridge massachusetts', 'greater boston'],
  Chicago:         ['chicago'],
  Austin:          ['austin'],
  London:          ['london', 'greater london', 'london area'],
  Dubai:           ['dubai'],
  'Abu Dhabi':     ['abu dhabi'],
  Singapore:       ['singapore'],
  Berlin:          ['berlin'],
  Amsterdam:       ['amsterdam'],
  Paris:           ['paris'],
  Toronto:         ['toronto', 'greater toronto'],
  Sydney:          ['sydney'],
  'Hong Kong':     ['hong kong'],
  Tokyo:           ['tokyo'],
  Riyadh:          ['riyadh'],
  Doha:            ['doha'],
}

/** Country for each canonical city — display is "City, Country". */
const CITY_COUNTRY: Record<string, string> = {
  Bengaluru: 'India', Mumbai: 'India', 'Delhi NCR': 'India', Hyderabad: 'India', Pune: 'India', Chennai: 'India', Kolkata: 'India',
  Ahmedabad: 'India', Jaipur: 'India', Kochi: 'India', Mangaluru: 'India', Coimbatore: 'India', Indore: 'India', Chandigarh: 'India',
  Bhubaneswar: 'India', Trivandrum: 'India',
  'New York': 'United States', 'San Francisco': 'United States', 'Los Angeles': 'United States', Seattle: 'United States', Boston: 'United States',
  Chicago: 'United States', Austin: 'United States', London: 'United Kingdom', Dubai: 'United Arab Emirates', 'Abu Dhabi': 'United Arab Emirates',
  Singapore: 'Singapore', Berlin: 'Germany', Amsterdam: 'Netherlands', Paris: 'France', Toronto: 'Canada', Sydney: 'Australia',
  'Hong Kong': 'Hong Kong', Tokyo: 'Japan', Riyadh: 'Saudi Arabia', Doha: 'Qatar',
}

// ── Every populated place in India and the United States (GeoNames via all-the-cities, MIT).
// Regenerate with `npm run gen:cities`. Rows: [name, countryCode, stateName, population].
import citiesJson from './cities.generated.json'

type CityRow = [name: string, cc: 'IN' | 'US', state: string, population: number]
const COUNTRY_NAME: Record<string, string> = { IN: 'India', US: 'United States' }

/** Country names and codes as they appear in location strings → country code. */
const COUNTRY_ALIASES: Record<string, string> = {
  india: 'IN', bharat: 'IN',
  'united states': 'US', 'united states of america': 'US', usa: 'US', 'u s': 'US', 'u s a': 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  canada: 'CA', australia: 'AU', germany: 'DE', deutschland: 'DE', france: 'FR', netherlands: 'NL', singapore: 'SG',
  'united arab emirates': 'AE', uae: 'AE', 'saudi arabia': 'SA', qatar: 'QA', japan: 'JP', 'hong kong': 'HK',
  ireland: 'IE', spain: 'ES', italy: 'IT', switzerland: 'CH', sweden: 'SE', mexico: 'MX', brazil: 'BR', china: 'CN',
  'south africa': 'ZA', nigeria: 'NG', kenya: 'KE', 'sri lanka': 'LK', bangladesh: 'BD', pakistan: 'PK', nepal: 'NP',
  indonesia: 'ID', malaysia: 'MY', philippines: 'PH', vietnam: 'VN', thailand: 'TH', 'new zealand': 'NZ', israel: 'IL',
  poland: 'PL', portugal: 'PT', belgium: 'BE', austria: 'AT', denmark: 'DK', norway: 'NO', finland: 'FI', 'south korea': 'KR',
}
const HUB_COUNTRY_CODE: Record<string, string> = {
  India: 'IN', 'United States': 'US', 'United Kingdom': 'GB', 'United Arab Emirates': 'AE', Singapore: 'SG', Germany: 'DE',
  Netherlands: 'NL', France: 'FR', Canada: 'CA', Australia: 'AU', 'Hong Kong': 'HK', Japan: 'JP', 'Saudi Arabia': 'SA', Qatar: 'QA',
}

const US_STATE_CODES: Record<string, string> = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California', co: 'Colorado', ct: 'Connecticut',
  de: 'Delaware', dc: 'District of Columbia', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho', il: 'Illinois',
  in: 'Indiana', ia: 'Iowa', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland',
  ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri', mt: 'Montana',
  ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York',
  nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania',
  ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah',
  vt: 'Vermont', va: 'Virginia', wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming', pr: 'Puerto Rico',
}
const IN_STATE_CODES: Record<string, string> = {
  ap: 'Andhra Pradesh', ar: 'Arunachal Pradesh', as: 'Assam', br: 'Bihar', cg: 'Chhattisgarh', ct: 'Chhattisgarh', dl: 'Delhi',
  ga: 'Goa', gj: 'Gujarat', hr: 'Haryana', hp: 'Himachal Pradesh', jk: 'Jammu and Kashmir', jh: 'Jharkhand', ka: 'Karnataka',
  kl: 'Kerala', mp: 'Madhya Pradesh', mh: 'Maharashtra', mn: 'Manipur', ml: 'Meghalaya', mz: 'Mizoram', nl: 'Nagaland',
  od: 'Odisha', or: 'Odisha', pb: 'Punjab', rj: 'Rajasthan', sk: 'Sikkim', tn: 'Tamil Nadu', ts: 'Telangana', tg: 'Telangana',
  tr: 'Tripura', up: 'Uttar Pradesh', uk: 'Uttarakhand', ut: 'Uttarakhand', wb: 'West Bengal', py: 'Puducherry', ch: 'Chandigarh',
}
const IN_STATE_SYNONYMS: Record<string, string> = {
  orissa: 'Odisha', pondicherry: 'Puducherry', uttaranchal: 'Uttarakhand', bombay: 'Maharashtra', 'new delhi': 'Delhi', 'delhi ncr': 'Delhi',
  'andhra': 'Andhra Pradesh', 'tamilnadu': 'Tamil Nadu', 'west bengal': 'West Bengal',
}

/** A hint parsed from a non-city segment: a state (with the country it implies) or a country. */
type Hint = { kind: 'state'; cc: 'IN' | 'US'; state: string; strong: boolean } | { kind: 'country'; cc: string; strong: boolean }

/** Index: slug(name) → rows, plus slug(stateName) → { cc, state }. Built once, lazily. */
let cityIndex: Map<string, CityRow[]> | null = null
let stateIndex: Map<string, { cc: 'IN' | 'US'; state: string }> | null = null
function indexes() {
  if (cityIndex && stateIndex) return { cityIndex, stateIndex }
  cityIndex = new Map()
  stateIndex = new Map()
  for (const row of (citiesJson as unknown as { rows: CityRow[] }).rows) {
    const key = slugifyPlace(row[0])
    const list = cityIndex.get(key)
    if (list) list.push(row)
    else cityIndex.set(key, [row])
    if (row[2]) stateIndex.set(slugifyPlace(row[2]), { cc: row[1], state: row[2] })
  }
  for (const [k, v] of Object.entries(IN_STATE_SYNONYMS)) stateIndex.set(k, { cc: 'IN', state: v })
  return { cityIndex, stateIndex }
}

/** Interpret one segment ("TX", "Texas", "India", "Karnataka") as a hint, or null when it is not one. */
function hintsFor(seg: string): Hint[] {
  const { stateIndex } = indexes()
  const out: Hint[] = []
  const st = stateIndex.get(seg)
  if (st) out.push({ kind: 'state', cc: st.cc, state: st.state, strong: true })
  const country = COUNTRY_ALIASES[seg]
  if (country) out.push({ kind: 'country', cc: country, strong: seg.length > 3 })
  if (seg.length === 2) {
    if (US_STATE_CODES[seg]) out.push({ kind: 'state', cc: 'US', state: US_STATE_CODES[seg], strong: false })
    if (IN_STATE_CODES[seg]) out.push({ kind: 'state', cc: 'IN', state: IN_STATE_CODES[seg], strong: false })
    if (seg === 'in') out.push({ kind: 'country', cc: 'IN', strong: false })
    if (seg === 'us') out.push({ kind: 'country', cc: 'US', strong: false })
  }
  return out
}

const NOISE_RE = /^(greater|metro)\s+|\s+(metropolitan area|metro area|metroplex|bay area|area|region|county|district|city|urban|division)$/g

/** Split a raw location into place candidates (in order) and hints. PURE. */
function parseLocation(raw: string): { places: string[]; hints: Hint[] } {
  const places: string[] = []
  const hints: Hint[] = []
  const segments = raw.split(/[,|;·•/()]|\s[-–—]\s|→|->|=>|✈|➜|»/).map((x) => slugifyPlace(x)).filter(Boolean)
  for (const seg0 of segments) {
    let seg = seg0
    const h = hintsFor(seg)
    if (h.length) { hints.push(...h); continue }
    // "Austin Texas" / "Surat Gujarat" / "Nagpur India": peel a trailing state or country off the place.
    const words = seg.split(' ')
    for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
      const tail = words.slice(-n).join(' ')
      const th = hintsFor(tail)
      if (th.length && th.some((x) => x.strong)) { hints.push(...th); seg = words.slice(0, -n).join(' '); break }
    }
    seg = seg.replace(NOISE_RE, '').trim()
    if (seg) places.push(seg)
  }
  return { places, hints }
}

type Resolved = { city: string; country: string | null; via: 'hub' | 'dictionary' | 'fuzzy' }

/**
 * Look a place up in the India/US dictionary. Accepts a match when a hint confirms
 * it (state or country), or unhinted when the place is big enough that the name alone
 * is not a guess (≥ 100k people, the largest of that name, and no other unexplained
 * segment in the string). PURE.
 */
function dictionaryMatch(place: string, hints: Hint[], alone: boolean): (Resolved & { confirmedBy: 'state' | 'country' | 'population' }) | null {
  const { cityIndex } = indexes()
  const tryKeys = [place]
  if (place.includes(' ')) tryKeys.push(place.split(' ')[0])            // "raleigh durham chapel hill" → raleigh
  for (const key of tryKeys) {
    const rows = cityIndex.get(key)
    if (!rows?.length) continue
    const byState = rows.filter((r) => hints.some((h) => h.kind === 'state' && h.cc === r[1] && h.state === r[2]))
    const byCountry = rows.filter((r) => hints.some((h) => h.kind === 'country' && h.cc === r[1]))
    const pick = (list: CityRow[]) => list.reduce((a, b) => (b[3] > a[3] ? b : a))
    if (byState.length) { const r = pick(byState); return { city: r[0], country: COUNTRY_NAME[r[1]], via: 'dictionary', confirmedBy: 'state' } }
    if (hints.some((h) => h.kind === 'state' && h.strong)) return null // a state was named and this place is not in it
    if (byCountry.length) { const r = pick(byCountry); return { city: r[0], country: COUNTRY_NAME[r[1]], via: 'dictionary', confirmedBy: 'country' } }
    if (hints.some((h) => h.kind === 'country' && h.strong)) return null // another country was named
    if (!alone) return null                                            // "Springfield, Ontario": an unknown region — don't guess
    const r = pick(rows)
    if (r[3] >= 100_000) return { city: r[0], country: COUNTRY_NAME[r[1]], via: 'dictionary', confirmedBy: 'population' }
    return null
  }
  return null
}

/** "New York, United States" / "Bengaluru, India"; falls back to the raw string (or null). PURE. */
export function formatLocation(raw: string | null | undefined): string | null {
  const r = resolveLocation(raw)
  if (r) return r.country ? `${r.city}, ${r.country}` : r.city
  const t = String(raw ?? '').trim()
  return t || null
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
 * Order of trust: (1) the hand-kept hub aliases, which also fold satellites onto
 * their metro ("Gurgaon" → Delhi NCR); (2) the India/US dictionary, matched on the
 * first place segment and confirmed by a state/country hint or by size; (3) fuzzy
 * hub aliases for misspellings ("banglore" → Bengaluru). A hub hit yields to the
 * dictionary when a state hint says the place is elsewhere ("Paris, TX"), and is
 * dropped when a country hint contradicts it ("London, Ontario, Canada"). For
 * multi-city strings a movement marker means the LAST city wins; otherwise the
 * FIRST, because "City, State, Country" is the common shape. PURE.
 */
export function resolveLocation(raw: string | null | undefined): Resolved | null {
  const text = String(raw ?? '')
  const s = slugifyPlace(text)
  if (!s) return null
  const moved = MOVED.test(text)
  const { places, hints } = parseLocation(text)

  // (1) hubs — exact alias anywhere in the string
  const hits: { canon: string; at: number }[] = []
  const padded = ` ${s} `
  for (const { canon, alias } of flat) {
    const at = padded.indexOf(` ${alias} `)
    if (at >= 0) hits.push({ canon, at })
  }
  let hub: string | null = null
  if (hits.length) {
    const distinct = Array.from(new Set(hits.map((h) => h.canon)))
    if (distinct.length === 1) hub = distinct[0]
    else { hits.sort((a, b) => a.at - b.at); hub = moved ? hits[hits.length - 1].canon : hits[0].canon }
  }
  const hubCc = hub ? HUB_COUNTRY_CODE[CITY_COUNTRY[hub]] : null
  if (hub && hints.some((h) => h.kind === 'country' && h.strong && h.cc !== hubCc)) hub = null

  // (2) dictionary — on the place that "wins" by position
  const place = moved ? places[places.length - 1] : places[0]
  const dict = place ? dictionaryMatch(place, hints, places.length === 1) : null
  if (hub && dict && dict.confirmedBy === 'state' && HUB_COUNTRY_CODE[dict.country ?? ''] !== hubCc) return dict
  if (hub) return { city: hub, country: CITY_COUNTRY[hub] ?? null, via: 'hub' }
  if (dict) return dict

  // (3) fuzzy hubs, token by token
  const fuzzy: { canon: string; at: number }[] = []
  const tokens = s.split(' ').filter((t) => t.length >= 4)
  for (let i = 0; i < tokens.length; i++) {
    for (const { canon, alias } of flat) {
      if (alias.includes(' ') || alias.length < 4) continue
      const cap = alias.length >= 7 ? 2 : 1
      if (editDistance(tokens[i], alias, cap) <= cap) fuzzy.push({ canon, at: i })
    }
  }
  if (!fuzzy.length) return null
  const distinct = Array.from(new Set(fuzzy.map((h) => h.canon)))
  let canon = distinct[0]
  if (distinct.length > 1) { fuzzy.sort((a, b) => a.at - b.at); canon = moved ? fuzzy[fuzzy.length - 1].canon : fuzzy[0].canon }
  if (hints.some((h) => h.kind === 'country' && h.strong && h.cc !== HUB_COUNTRY_CODE[CITY_COUNTRY[canon]])) return null
  return { city: canon, country: CITY_COUNTRY[canon] ?? null, via: 'fuzzy' }
}

/** Canonical city name only (see resolveLocation). PURE. */
export function normalizeCity(raw: string | null | undefined): string | null {
  return resolveLocation(raw)?.city ?? null
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
