/**
 * Find the website of every school in the database that the resolver can't name, and
 * store it in `brand_domains` so logos start appearing for them.
 *
 *   npx tsx scripts/resolve-school-domains.ts            # dry run, prints what it found
 *   npx tsx scripts/resolve-school-domains.ts --apply    # writes to brand_domains
 *
 * WHY THIS IS A SCRIPT AND NOT PART OF THE PAGE. A name lookup is two Wikidata calls,
 * it is rate-limited (the API starts refusing after a handful of requests), and the
 * answer never changes. Doing it while rendering a profile would be slow, fragile and
 * repeated forever. Resolved once into `brand_domains`, the page does a table lookup.
 *
 * WHY WIKIDATA. Company domains can be guessed from the name — school domains cannot
 * ("Indian Institute of Technology, Madras" is iitm.ac.in). Wikidata has the official
 * website of essentially every university, including the .ac.in institutions the free
 * favicon service has never heard of, and it needs no API key.
 *
 * THE TRAP THIS GUARDS AGAINST. A plain name search for "IIM Kozhikode" returns the
 * *journal* "IIM Kozhikode Society & Management Review", whose website is
 * ksm.sagepub.com. Storing that would put a publisher's logo on someone's education
 * history. So every hit must be an educational institution by Wikidata's own
 * `instance of` claim — not merely a text match on the name.
 *
 * A school we cannot resolve is written as a NULL domain, which the resolver reads as
 * "stop asking, draw the monogram". Most of those are secondary schools, which have no
 * logo to find anywhere.
 */
import fs from 'node:fs'
import path from 'node:path'
import { brandDomain, normalizeName } from '../src/lib/brand-icon'

const APPLY = process.argv.includes('--apply')
const LOGODEV = process.env.LOGODEV_TOKEN
const UA = 'RecruiterStack/1.0 (candidate profile logos; contact tech@recruiterstack.in)'
/** Wikidata starts refusing at speed; this keeps a full run comfortably inside its limits. */
const THROTTLE_MS = 350

/** `instance of` values that make an entity a place of education. */
const EDUCATION_QIDS = new Set([
  'Q3918',    // university
  'Q38723',   // higher education institution
  'Q189004',  // college
  'Q875538',  // public university
  'Q902104',  // private university
  'Q1371037', // institute of technology
  'Q1254933', // business school
  'Q3914',    // school
  'Q9842',    // primary school
  'Q159334',  // secondary school
  'Q2385804', // educational institution
  'Q4671277', // academic institution
  'Q23002037',// private not-for-profit educational institution
  'Q62078547',// public educational institution
  'Q1663017', // engineering school
  'Q1785271', // medical school
  'Q1371037', // institute of technology
  'Q15936437',// research university
  'Q3354859', // collegiate university
  'Q847027',  // academy
  // Found by running this against the real data — these blocked real schools:
  'Q9826',     // public high school (Clements High School)
  'Q1336920',  // community college (Orange Coast College)
  'Q23002039', // public educational institution of the United States
  'Q7603893',  // state university of India (Veer Narmad South Gujarat University)
  'Q5341295',  // educational organization
  'Q5341296',  // educational organisation
  'Q1321960',  // public school
  'Q3199141',  // private school
])

const root = process.cwd()
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = async (p: string, init?: RequestInit) =>
  fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

const wiki = async (url: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    // Wikidata answers rate limiting with prose, not JSON.
    throw new Error(`Wikidata refused: ${text.slice(0, 80)}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Hit { domain: string | null; label: string; note: string }

/**
 * Branch qualifiers that name a BRANCH rather than the institution.
 *
 * Indian school chains are most of the education rows here, and a branch never has its
 * own Wikidata entry — there are over 1,250 Kendriya Vidyalayas. But every branch flies
 * the same emblem, and the parent's name is already sitting inside the branch name. So
 * when the full name finds nothing, walk back toward the parent and try again:
 *
 *   "Kendriya Vidyalaya No. 3, Bhopal"          → Kendriya Vidyalaya   (kvsangathan.nic.in)
 *   "Delhi Public School, Dhanbad"              → Delhi Public School  (dpsrkp.net)
 *   "Amity International School, Sec-46, Gurugram" → Amity International School
 *
 * This invents nothing — it only ever shortens a name the record already contains.
 */
const BRANCH_TAIL =
  /\s*\b(?:no\.?\s*\d+|sector\s*[-\s]?\d+|sec[-\s]?\d+|unit\s*\d+|campus|branch)\b.*$/i

/**
 * Progressively shorter names, MOST SPECIFIC FIRST — a branch that does have its own
 * entry should win over its chain. Never shorter than two words, and never the original.
 */
export function parentNames(name: string): string[] {
  const out: string[] = []
  const original = name.trim().toLowerCase()
  const push = (n: string) => {
    const t = n.replace(/[\s,(-]+$/, '').replace(/\s+/g, ' ').trim()
    if (!t || t.toLowerCase() === original) return
    if (t.split(/\s+/).length < 2 || out.includes(t)) return
    out.push(t)
  }
  const parts = name.split(',').map((p) => p.trim()).filter(Boolean)
  // Drop trailing comma-separated qualifiers one at a time: the city, then the number.
  for (let keep = parts.length - 1; keep >= 1; keep--) {
    const shorter = parts.slice(0, keep).join(', ')
    push(shorter)
    push(shorter.replace(BRANCH_TAIL, ''))
  }
  push(name.replace(BRANCH_TAIL, ''))
  return out
}

/** A domain is only worth storing if a provider actually has a logo for it. */
async function hasLogo(domain: string): Promise<boolean> {
  if (!LOGODEV) return true // no token here; trust Wikidata as before
  try {
    const res = await fetch(
      `https://img.logo.dev/${encodeURIComponent(domain)}?token=${LOGODEV}&size=64&format=png&fallback=404`,
      { headers: { 'User-Agent': UA } },
    )
    return res.ok
  } catch {
    return false
  }
}

async function resolveSchool(name: string): Promise<Hit> {
  const search = await wiki(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}` +
    `&language=en&format=json&type=item&limit=5`,
  )
  const candidates: { id: string; label: string; description?: string }[] = search.search ?? []
  if (!candidates.length) return { domain: null, label: '', note: 'no wikidata entity' }

  await sleep(THROTTLE_MS)
  const ids = candidates.map((c) => c.id).join('|')
  const entities = await wiki(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`,
  )

  for (const candidate of candidates) {
    const claims = entities.entities?.[candidate.id]?.claims
    if (!claims) continue
    const instanceOf: string[] = (claims.P31 ?? [])
      .map((c: { mainsnak?: { datavalue?: { value?: { id?: string } } } }) => c.mainsnak?.datavalue?.value?.id)
      .filter(Boolean)
    // The guard: a text match is not enough. "IIM Kozhikode" matches a journal whose
    // website is a publisher's — storing it would brand someone's degree with SAGE.
    if (!instanceOf.some((q) => EDUCATION_QIDS.has(q))) continue

    const site: string | undefined = claims.P856?.[0]?.mainsnak?.datavalue?.value
    if (!site) return { domain: null, label: candidate.label, note: 'school, but no website recorded' }
    try {
      return {
        // "www2.lehigh.edu" is the same brand as lehigh.edu, and a logo provider keyed
        // on the bare domain will miss the subdomain. Only the www-style prefix goes —
        // stripping any leading label would break iitb.ac.in.
        domain: new URL(site).hostname.replace(/^www\d*\./, ''),
        label: candidate.label,
        note: `${candidate.id}`,
      }
    } catch {
      return { domain: null, label: candidate.label, note: 'unparseable website' }
    }
  }
  return { domain: null, label: candidates[0].label, note: 'matches exist but none is a school' }
}

/**
 * The full name, then its parents. A branch inherits its chain's emblem, which is the
 * right answer — "Kendriya Vidyalaya No. 3, Bhopal" should fly the KV crest.
 */
async function resolveWithParents(name: string): Promise<Hit> {
  const direct = await resolveSchool(name)
  if (direct.domain && (await hasLogo(direct.domain))) return direct

  for (const parent of parentNames(name)) {
    await sleep(THROTTLE_MS)
    let hit: Hit
    try { hit = await resolveSchool(parent) } catch { break }
    if (hit.domain && (await hasLogo(hit.domain))) {
      return { ...hit, note: `${hit.note} via parent "${parent}"` }
    }
  }
  return direct.domain ? { ...direct, domain: null, note: `${direct.note}; no logo for it` } : direct
}

async function main() {
  // Every school named in an education record, on both sides of the product.
  const counts = new Map<string, number>()
  const addAll = (rows: { education: { school?: string | null }[] | null }[]) => {
    for (const row of rows) {
      for (const entry of row.education ?? []) {
        const school = (entry?.school ?? '').trim()
        if (school) counts.set(school, (counts.get(school) ?? 0) + 1)
      }
    }
  }
  addAll(await (await sb('candidates?select=education&limit=1000')).json())
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await sb(`pool_profiles?select=education&limit=1000&offset=${offset}`)).json()
    if (!rows.length) break
    addAll(rows)
    if (rows.length < 1000) break
  }

  // Universities appear in the EMPLOYER field too — research assistants, campus staff,
  // teaching interns. Those rows want the school's crest just as much as a degree does,
  // and nothing else will ever resolve them.
  const ACADEMIC_EMPLOYER = /\b(?:university|universidad|institute|college|school|polytechnic|iit|iim|nit|iisc|iiit)\b/i
  const addEmployers = (rows: { employer?: string | null }[]) => {
    for (const row of rows) {
      const employer = (row.employer ?? '').trim()
      if (employer && ACADEMIC_EMPLOYER.test(employer)) counts.set(employer, (counts.get(employer) ?? 0) + 1)
    }
  }
  addEmployers(await (await sb('candidate_experiences?select=employer&limit=1000')).json())
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await sb(`pool_experiences?select=employer&limit=1000&offset=${offset}`)).json()
    if (!rows.length) break
    addEmployers(rows)
    if (rows.length < 1000) break
  }

  // Only the ones the code tables can't already name.
  const todo = Array.from(counts.entries())
    .filter(([name]) => !brandDomain(name, 'school'))
    .sort((a, b) => b[1] - a[1])

  console.log(`${counts.size} distinct schools (education records + academic employers); ${todo.length} have no domain yet.`)
  console.log(APPLY ? 'Writing to brand_domains.\n' : 'DRY RUN — pass --apply to write.\n')

  let found = 0
  const rows: { name_norm: string; kind: string; domain: string | null; note: string }[] = []
  for (const [name, count] of todo) {
    let hit: Hit
    try {
      hit = await resolveWithParents(name)
    } catch (err) {
      console.log(`  !! ${name} — ${(err as Error).message}`)
      break // rate limited: stop cleanly and keep what we have
    }
    if (hit.domain) found++
    console.log(`  ${String(count).padStart(3)}  ${name.padEnd(52)} ${hit.domain ?? '—'}  ${hit.domain ? `(${hit.label})` : hit.note}`)
    rows.push({ name_norm: normalizeName(name, 'school'), kind: 'school', domain: hit.domain, note: `wikidata: ${hit.note}` })
    await sleep(THROTTLE_MS)
  }

  console.log(`\nresolved ${found} of ${rows.length} looked up.`)

  if (!APPLY || !rows.length) return
  // De-duplicate on the primary key: two spellings can normalise to one row.
  const byKey = new Map(rows.map((r) => [`${r.name_norm}|${r.kind}`, r]))
  const res = await sb('brand_domains?on_conflict=name_norm,kind', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(Array.from(byKey.values())),
  })
  if (!res.ok) {
    console.error(`\nWrite failed (${res.status}): ${await res.text()}`)
    console.error('Has migration 151_brand_domains.sql been applied?')
    process.exit(1)
  }
  console.log(`wrote ${byKey.size} rows to brand_domains.`)
}

// Run only when invoked directly. This module exports helpers that tests and other
// scripts import, and a bare main() call would kick off a full resolve on import —
// which it did, once.
if (process.argv[1]?.endsWith('resolve-school-domains.ts')) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
