/**
 * Learn what we can about every employer in the database, from Wikidata.
 *
 *   npm run enrich:companies            # dry run
 *   npm run enrich:companies -- --apply
 *
 * WHAT THIS BUYS. A recruiter filters on the company as much as the person — fintech
 * background, somewhere public, an early-stage environment — and a résumé names an
 * employer and nothing else. This fills that in: industry, founding year, headcount
 * where it exists, and whether the company is publicly listed.
 *
 * WHAT IT WILL NOT DO. Funding stage. Wikidata has no reliable round history, so the
 * "Series A through Series G" chip cannot be built from it without inventing the
 * answer. Checked directly against our own pool before writing this: Meta and McKinsey
 * carry an employee count; Flipkart, Razorpay and Shadowfax carry none. So headcount is
 * stored when present and treated as UNKNOWN when absent, never as "small".
 *
 * THE SAME IDENTITY GUARD AS THE DOMAIN RESOLVERS. A name search returns the first
 * plausible entity, and company names collide with films, characters and journals —
 * "Shadowfax" matched a horse. So a hit must be an organisation by Wikidata's own
 * `instance of`, and its label has to resemble the employer we asked about.
 *
 * Idempotent: employers already answered are skipped, so a re-run after an import only
 * does the new work.
 */
import fs from 'node:fs'
import path from 'node:path'
import { isUnbrandable, normalizeName } from '../src/lib/brand-icon'

const APPLY = process.argv.includes('--apply')
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0')
const UA = 'RecruiterStack/1.0 (company enrichment; contact tech@recruiterstack.in)'
/** Wikidata refuses at speed; this keeps a full run inside its limits. */
const THROTTLE_MS = 400

/** `instance of` values that make an entity a company rather than a film or a horse. */
const ORG_QIDS = new Set([
  'Q4830453',   // business
  'Q891723',    // public company
  'Q783794',    // company
  'Q6881511',   // enterprise
  'Q43229',     // organization
  'Q4358176',   // council
  'Q161726',    // multinational corporation
  'Q219577',    // holding company
  'Q1589009',   // privately held company
  'Q18388277',  // technology company
  'Q1058914',   // software company
  'Q2085381',   // publisher
  'Q507619',    // retail chain
  'Q4287745',   // medical organisation
  'Q163740',    // nonprofit organization
  'Q31855',     // research institute
  'Q3918',      // university (a university IS an employer)
  'Q875538',    // public university
  'Q38723',     // higher education institution
  'Q4022',      // (river — never; kept out deliberately)
])
ORG_QIDS.delete('Q4022')

/** Publicly listed, for the "Public company" chip. */
const PUBLIC_QIDS = new Set(['Q891723', 'Q7257717', 'Q134161'])

const root = process.cwd()
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !K) { console.error('Missing Supabase credentials in .env.local'); process.exit(1) }
const h = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const rest = async (p: string, init?: RequestInit) => fetch(`${U}/rest/v1/${p}`, { ...init, headers: { ...h, ...(init?.headers ?? {}) } })
const get = async (p: string) => (await rest(p)).json()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const wiki = async (url: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error('Wikidata rate limited') }
}

/**
 * Wikidata's structured claims are thinner than the article beside them. Checked
 * against our own pool: Flipkart (22,000), Rippling (5,000) and Swiggy (6,000) all
 * carry a headcount in the Wikipedia infobox and none in Wikidata. So when a claim is
 * missing, read the article — reached through the entity's own sitelink, never a second
 * name search, so the identity guard still holds.
 */
function cleanInfobox(raw: string): string {
  return raw
    .replace(/<ref[^>]*\/>/gi, ' ')
    .replace(/<ref[\s\S]*?<\/ref>/gi, ' ')
    .replace(/\{\{[^}]*\}?\}?/g, ' ')
    .replace(/\[\[([^\]|]*\|)?/g, '')
    .replace(/\]\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function infoboxField(wikitext: string, key: string): string | null {
  const m = wikitext.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\n]{1,200})`, 'i'))
  const v = m ? cleanInfobox(m[1]) : ''
  return v || null
}

/** "22,000 (excluding Myntra)" → 22000. The first plain number wins. */
function firstNumber(v: string | null): number | null {
  if (!v) return null
  const m = v.match(/\d[\d,]{2,}/)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

async function fromWikipedia(title: string): Promise<{ employees: number | null; founded: number | null; industries: string[] }> {
  const blank = { employees: null, founded: null, industries: [] as string[] }
  try {
    const r = await wiki(
      `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main` +
      `&format=json&formatversion=2&titles=${encodeURIComponent(title)}`,
    )
    const text: string = r.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? ''
    if (!text) return blank
    const industry = infoboxField(text, 'industry')
    return {
      employees: firstNumber(infoboxField(text, 'num_employees')),
      founded: firstNumber(infoboxField(text, 'founded'))
        ?? (Number(infoboxField(text, 'founded')?.match(/\b(1[89]|20)\d{2}\b/)?.[0]) || null),
      // Split a piped list ("E-commerce | Retail") and drop anything implausible.
      industries: industry
        ? industry.split(/[,;|]|\band\b/).map((x) => x.trim()).filter((x) => x.length > 2 && x.length < 40).slice(0, 4)
        : [],
    }
  } catch {
    return blank
  }
}

interface Facts {
  name_norm: string
  display_name: string | null
  wikidata_id: string | null
  founded_year: number | null
  employees: number | null
  industries: string[]
  country_code: string | null
  is_public: boolean | null
  note: string
}

/** Does the matched entity plausibly name the employer we asked about? */
function labelMatches(employer: string, label: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
  const a = norm(employer)
  const b = norm(label)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

async function lookup(employer: string): Promise<Facts> {
  const base: Facts = {
    name_norm: normalizeName(employer, 'company'),
    display_name: null, wikidata_id: null, founded_year: null, employees: null,
    industries: [], country_code: null, is_public: null, note: '',
  }

  const search = await wiki(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(employer)}` +
    `&language=en&format=json&type=item&limit=5`,
  )
  const candidates: { id: string; label: string }[] = search.search ?? []
  if (!candidates.length) return { ...base, note: 'no wikidata entity' }

  await sleep(THROTTLE_MS)
  const entities = await wiki(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${candidates.map((c) => c.id).join('|')}` +
    `&props=claims|labels|sitelinks&format=json&languages=en&sitefilter=enwiki`,
  )

  for (const candidate of candidates) {
    const ent = entities.entities?.[candidate.id]
    const claims = ent?.claims
    if (!claims) continue
    const qids = (p: string): string[] =>
      (claims[p] ?? []).map((c: { mainsnak?: { datavalue?: { value?: { id?: string } } } }) => c.mainsnak?.datavalue?.value?.id).filter(Boolean)
    const instanceOf = qids('P31')
    if (!instanceOf.some((q) => ORG_QIDS.has(q))) continue
    // "Shadowfax" is a horse before it is a logistics company. The label has to look
    // like what we asked about, not merely be the first organisation returned.
    const label: string = ent.labels?.en?.value ?? candidate.label
    if (!labelMatches(employer, label)) continue

    const first = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value
    const founded = first('P571')?.time
    const employeesRaw = first('P1128')?.amount
    const industryIds = qids('P452')
    const countryId = qids('P17')[0]

    let industries: string[] = []
    if (industryIds.length) {
      await sleep(THROTTLE_MS)
      const labels = await wiki(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${industryIds.slice(0, 6).join('|')}` +
        `&props=labels&format=json&languages=en`,
      )
      industries = industryIds
        .slice(0, 6)
        .map((id) => labels.entities?.[id]?.labels?.en?.value)
        .filter((x: string | undefined): x is string => Boolean(x))
    }

    let country: string | null = null
    if (countryId) {
      await sleep(THROTTLE_MS)
      const c = await wiki(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${countryId}&props=claims&format=json`,
      )
      country = c.entities?.[countryId]?.claims?.P297?.[0]?.mainsnak?.datavalue?.value ?? null
    }

    let foundedYear = founded ? Number(String(founded).slice(1, 5)) || null : null
    let employees = employeesRaw ? Math.round(Number(String(employeesRaw).replace('+', ''))) || null : null

    // Fill the gaps from the article itself, reached by the entity's own sitelink.
    const article: string | undefined = ent.sitelinks?.enwiki?.title
    let via = `wikidata ${candidate.id}`
    if (article && (employees == null || foundedYear == null || !industries.length)) {
      await sleep(THROTTLE_MS)
      const wp = await fromWikipedia(article)
      if (employees == null && wp.employees != null) { employees = wp.employees; via += ' + enwiki headcount' }
      if (foundedYear == null && wp.founded != null) { foundedYear = wp.founded; via += ' + enwiki founded' }
      if (!industries.length && wp.industries.length) { industries = wp.industries; via += ' + enwiki industry' }
    }

    return {
      ...base,
      display_name: label,
      wikidata_id: candidate.id,
      founded_year: foundedYear,
      employees,
      industries,
      country_code: country,
      is_public: instanceOf.some((q) => PUBLIC_QIDS.has(q)) ? true : null,
      note: via,
    }
  }
  return { ...base, note: 'matches exist but none is an organisation by that name' }
}

async function main() {
  const counts = new Map<string, number>()
  const add = (rows: { employer?: string | null }[]) => {
    for (const row of rows) {
      const e = (row.employer ?? '').trim()
      if (e && !isUnbrandable(e)) counts.set(e, (counts.get(e) ?? 0) + 1)
    }
  }
  add(await get('candidate_experiences?select=employer&limit=1000'))
  for (let offset = 0; ; offset += 1000) {
    const rows = await get(`pool_experiences?select=employer&limit=1000&offset=${offset}`)
    if (!rows.length) break
    add(rows)
    if (rows.length < 1000) break
  }

  // Tolerant of the table not existing yet: a dry run should work before migration 153
  // is applied, so you can see what it would find before deciding to apply it.
  const existing = await get('company_facts?select=name_norm&limit=5000')
  const known = new Set(
    Array.isArray(existing) ? (existing as { name_norm: string }[]).map((r) => r.name_norm) : [],
  )
  if (!Array.isArray(existing)) console.log('(company_facts not found — migration 153 not applied yet; dry run only)\n')
  const todo = Array.from(counts.entries())
    .filter(([name]) => !known.has(normalizeName(name, 'company')))
    .sort((a, b) => b[1] - a[1])
  const work = LIMIT ? todo.slice(0, LIMIT) : todo

  console.log(`${counts.size} distinct employers; ${work.length} not yet enriched.`)
  console.log(APPLY ? 'Writing to company_facts.\n' : 'DRY RUN — pass --apply to write.\n')

  const rows: Facts[] = []
  let found = 0
  for (const [employer, count] of work) {
    let facts: Facts
    try { facts = await lookup(employer) } catch (err) { console.log(`  !! ${employer} — ${(err as Error).message}`); break }
    if (facts.wikidata_id) {
      found++
      const bits = [
        facts.industries.length ? facts.industries.slice(0, 2).join('/') : null,
        facts.founded_year ? `est ${facts.founded_year}` : null,
        facts.employees ? `${facts.employees.toLocaleString()} staff` : null,
        facts.is_public ? 'public' : null,
      ].filter(Boolean).join(' · ')
      console.log(`  ${String(count).padStart(3)}  ${employer.slice(0, 40).padEnd(42)} ${bits || '(no attributes)'}`)
    }
    // De-duplicate on the primary key before the batch: two spellings normalise to one.
    if (!rows.some((r) => r.name_norm === facts.name_norm)) rows.push(facts)
    await sleep(THROTTLE_MS)
  }

  console.log(`\n${found} of ${rows.length} employers matched an organisation on Wikidata.`)
  const withIndustry = rows.filter((r) => r.industries.length).length
  const withStaff = rows.filter((r) => r.employees != null).length
  console.log(`   with an industry: ${withIndustry}   with a headcount: ${withStaff}   (headcount is sparse by nature)`)

  if (!APPLY || !rows.length) return
  for (let i = 0; i < rows.length; i += 400) {
    const res = await rest('company_facts?on_conflict=name_norm', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows.slice(i, i + 400)),
    })
    if (!res.ok) {
      console.error(`\nWrite failed (${res.status}): ${await res.text()}`)
      console.error('Has migration 153_company_facts.sql been applied?')
      process.exit(1)
    }
  }
  console.log(`wrote ${rows.length} rows to company_facts.`)
}

if (process.argv[1]?.endsWith('enrich-companies.ts')) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
