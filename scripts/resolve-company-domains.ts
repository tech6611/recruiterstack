/**
 * Find the real domain for every employer whose guessed one is wrong, and store it in
 * `brand_domains`.
 *
 *   npx tsx scripts/resolve-company-domains.ts            # dry run
 *   npx tsx scripts/resolve-company-domains.ts --apply    # writes to brand_domains
 *
 * THE PROBLEM THIS SOLVES. `brandDomain` guesses a domain by slugging the name, and
 * measured over the 70 most common guessed employers, 23% of those guesses are wrong.
 * Not marginally wrong — wrong in four different directions that pull against each
 * other, which is why no cleverer rule fixes them:
 *
 *   legal name ≠ brand   MindTickle Interactive Media Pvt Ltd. → mindtickle.com
 *   Indian .in, not .com  Shadowfax → shadowfax.in, Bajaj Finserv → bajajfinserv.in
 *   suffix handling       "Technologies" stripped when it shouldn't be (VCollab),
 *                         "LLP" not stripped when it should be (KonfHub)
 *   the domain is the name Salesken.ai is salesken.ai, not saleskenai.com
 *
 * So instead of guessing better, this asks and CHECKS. A domain is only stored once a
 * provider has actually returned a logo for it — the resolver cannot record a domain
 * that does not work, which is what makes a generated candidate safe to trust.
 *
 * TWO SOURCES, IN ORDER. Candidate domains built from the name and verified against
 * logo.dev; then Wikidata's official-website claim for the names that survive, verified
 * the same way. Wikidata knows PwC is pwc.com, which no amount of slugging finds.
 *
 * THE FALSE-POSITIVE GUARD. A short generic word can own a domain belonging to an
 * entirely different company — "Peak" is not peak.com. Truncated candidates (the first
 * word of a longer name) are only tried when that word is long enough to be a brand,
 * and a name that is a single common word is never truncated at all.
 *
 * Idempotent: employers already answered in `brand_domains` are skipped, so a re-run
 * after an import only does the new work.
 */
import fs from 'node:fs'
import path from 'node:path'
import { brandDomain, isUnbrandable, normalizeName } from '../src/lib/brand-icon'

const APPLY = process.argv.includes('--apply')
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0')
const UA = 'RecruiterStack/1.0 (candidate profile logos; contact tech@recruiterstack.in)'
const THROTTLE_MS = 120
const WIKI_THROTTLE_MS = 350

/** Tried in order. `.in` sits high because much of this database is Indian employers. */
const TLDS = ['com', 'in', 'io', 'ai', 'co', 'net', 'org', 'co.in', 'com.au', 'co.uk']

/** Legal-form tokens that are never part of a domain, trimmed from the end of a name. */
const LEGAL_TAIL = /\b(?:pvt|private|ltd|limited|llp|llc|inc|corp|corporation|plc|gmbh|co|company|sa|bv|nv|ag)\b/gi

/**
 * Words that can follow a brand without changing who the employer is. The head of a
 * long name is only trusted as the brand when everything after it is one of these.
 *
 * Without this, "Google Summer of Code" truncates to google.com and stamps Google's
 * corporate logo on a student programme. "Microsoft Research India" truncating to
 * microsoft.com is right; "Google Summer of Code" is not, and the difference is
 * exactly whether the tail is corporate filler or a distinct thing's name.
 */
const DESCRIPTIVE_TAIL = new Set([
  'research', 'technologies', 'technology', 'tech', 'interactive', 'media', 'labs',
  'laboratories', 'software', 'systems', 'solutions', 'services', 'consulting',
  'group', 'holdings', 'holding', 'ventures', 'partners', 'digital', 'innovations',
  'enterprises', 'industries', 'studios', 'works', 'networks', 'communications',
  'engineering', 'products', 'platforms', 'analytics', 'data', 'cloud', 'mobility',
  'retail', 'motors', 'bank', 'financial', 'finance', 'capital', 'healthcare',
  'pharma', 'energy', 'logistics', 'infra', 'infrastructure', 'ai', 'global',
  'international', 'india', 'usa', 'uk', 'singapore', 'worldwide', 'asia', 'emea',
  'and', 'the', 'of', 'corporation', 'company', 'centre', 'center',
])

/** Single words too generic to own their .com — never truncate a name down to these. */
const TOO_GENERIC = new Set([
  'peak', 'granular', 'apex', 'summit', 'bridge', 'spark', 'pulse', 'core', 'nova',
  'origin', 'vertex', 'atlas', 'orbit', 'prism', 'quantum', 'fusion', 'zenith',
  'global', 'digital', 'tech', 'labs', 'group', 'media', 'systems', 'solutions',
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
const LOGODEV = env.LOGODEV_TOKEN
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!LOGODEV) {
  console.error('Missing LOGODEV_TOKEN — this script verifies every domain against it before storing.')
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** True when a provider actually has a logo for this domain. The whole guard. */
async function hasLogo(domain: string): Promise<boolean> {
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

/** Domains worth trying for a name, most likely first. */
export function candidateDomains(rawName: string): string[] {
  const name = (rawName ?? '').trim()
  if (!name) return []
  const out: string[] = []
  const push = (d: string) => { if (d && !out.includes(d)) out.push(d) }

  // "Salesken.ai", "konfhub.com" — the name already contains its domain.
  const embedded = name.match(/\b([a-z0-9-]+\.(?:com|in|io|ai|co|net|org|edu))\b/i)
  if (embedded) push(embedded[1].toLowerCase())

  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+(?:[|·•‧]|[-–—:;])\s+/)[0]
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(LEGAL_TAIL, ' ')
    // "Accenture in India", "Sears Holding India" — a country tail is not the brand.
    .replace(/\b(?:india|usa|uk|singapore|global|worldwide)\b\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return out

  // Filter out fragments with no letters or digits: "MindTickle Interactive Media Pvt
  // Ltd." leaves a bare "." behind once the legal tail goes, and that stray word made
  // the tail look non-descriptive, so the brand head was never tried.
  const words = cleaned.split(' ').filter((w) => /[a-z0-9]/.test(w))
  const fullSlug = words.join('').replace(/\./g, '')
  for (const tld of TLDS) push(`${fullSlug}.${tld}`)

  // The brand is usually the head of a long legal name: "MindTickle Interactive
  // Media" → mindtickle. Only when that head is substantial enough to be a brand and
  // is not a word any company could claim.
  if (words.length > 1) {
    const head = words[0].replace(/\./g, '')
    const tailIsFiller = words.slice(1).every((w) => DESCRIPTIVE_TAIL.has(w))
    if (head.length >= 5 && !TOO_GENERIC.has(head) && tailIsFiller) {
      for (const tld of TLDS) push(`${head}.${tld}`)
    }
    if (words.length > 2 && words.slice(2).every((w) => DESCRIPTIVE_TAIL.has(w))) {
      const two = (words[0] + words[1]).replace(/\./g, '')
      if (two.length >= 6) for (const tld of TLDS.slice(0, 4)) push(`${two}.${tld}`)
    }
  }
  return out
}

/** Wikidata's official website for an organisation of this name. Verified separately. */
async function wikidataDomain(name: string): Promise<string | null> {
  const q = async (url: string) => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    const text = await res.text()
    try { return JSON.parse(text) } catch { throw new Error('rate limited') }
  }
  const search = await q(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}` +
    `&language=en&format=json&type=item&limit=3`,
  )
  const ids = (search.search ?? []).map((c: { id: string }) => c.id)
  if (!ids.length) return null
  await sleep(WIKI_THROTTLE_MS)
  const entities = await q(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims&format=json`,
  )
  for (const id of ids) {
    const site: string | undefined = entities.entities?.[id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value
    if (!site) continue
    try { return new URL(site).hostname.replace(/^www\d*\./, '') } catch { /* next */ }
  }
  return null
}

async function main() {
  // Every employer named anywhere, with how often it appears.
  const counts = new Map<string, number>()
  const add = (rows: { employer?: string | null }[]) => {
    for (const row of rows) {
      const employer = (row.employer ?? '').trim()
      if (employer) counts.set(employer, (counts.get(employer) ?? 0) + 1)
    }
  }
  add(await (await sb('candidate_experiences?select=employer&limit=1000')).json())
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await sb(`pool_experiences?select=employer&limit=1000&offset=${offset}`)).json()
    if (!rows.length) break
    add(rows)
    if (rows.length < 1000) break
  }

  // Already answered? Leave it alone — this is safe to re-run after an import.
  const existing = new Set(
    ((await (await sb('brand_domains?select=name_norm,kind&limit=5000')).json()) as { name_norm: string; kind: string }[])
      .filter((r) => r.kind === 'company')
      .map((r) => r.name_norm),
  )

  const todo = Array.from(counts.entries())
    .filter(([name]) => !isUnbrandable(name) && !existing.has(normalizeName(name, 'company')))
    .sort((a, b) => b[1] - a[1])
  const work = LIMIT ? todo.slice(0, LIMIT) : todo

  console.log(`${counts.size} distinct employers; ${work.length} to check.`)
  console.log(APPLY ? 'Writing verified domains to brand_domains.\n' : 'DRY RUN — pass --apply to write.\n')

  const rows: { name_norm: string; kind: string; domain: string | null; note: string }[] = []
  let kept = 0, fixed = 0, blank = 0

  for (const [name, count] of work) {
    const current = brandDomain(name, 'company')
    // The guess already works — nothing to store, nothing to change.
    if (current && (await hasLogo(current))) { kept++; await sleep(THROTTLE_MS); continue }

    let found: string | null = null
    let via = ''
    for (const candidate of candidateDomains(name)) {
      if (candidate === current) continue
      await sleep(THROTTLE_MS)
      if (await hasLogo(candidate)) { found = candidate; via = 'generated'; break }
    }
    if (!found) {
      try {
        const wiki = await wikidataDomain(name)
        await sleep(WIKI_THROTTLE_MS)
        if (wiki && (await hasLogo(wiki))) { found = wiki; via = 'wikidata' }
      } catch { /* rate limited — carry on without it */ }
    }

    if (found) {
      fixed++
      console.log(`  ${String(count).padStart(3)}  ${name.slice(0, 48).padEnd(50)} ${current ?? '—'} → ${found}  (${via})`)
    } else {
      blank++
    }
    rows.push({
      name_norm: normalizeName(name, 'company'),
      kind: 'company',
      domain: found,
      note: found ? `verified via ${via}` : 'no provider has a logo for any candidate domain',
    })
  }

  console.log(`\nguess already correct: ${kept}`)
  console.log(`real domain found    : ${fixed}`)
  console.log(`nothing anywhere     : ${blank}  (stored as NULL — stop asking, draw the monogram)`)

  if (!APPLY || !rows.length) return
  const byKey = new Map(rows.map((r) => [`${r.name_norm}|${r.kind}`, r]))
  const batch = Array.from(byKey.values())
  for (let i = 0; i < batch.length; i += 500) {
    const res = await sb('brand_domains?on_conflict=name_norm,kind', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(batch.slice(i, i + 500)),
    })
    if (!res.ok) {
      console.error(`\nWrite failed (${res.status}): ${await res.text()}`)
      process.exit(1)
    }
  }
  console.log(`wrote ${batch.length} rows to brand_domains.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
