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
/**
 * A HARD SPEND CAP, not a guideline.
 *
 * Exa's answer endpoint is $5 per 1,000 requests, so ~860 employers costs about $4.30
 * — comfortably inside the $10 of free credit. But a bug that retried in a loop would
 * spend real money silently, so the run counts its own requests and stops dead at the
 * cap rather than trusting the loop to terminate.
 */
const EXA_COST_PER_REQUEST = 0.005
const BUDGET_USD = Number(process.argv.find((a) => a.startsWith('--budget='))?.split('=')[1] ?? '8')
const MAX_EXA_REQUESTS = Math.floor(BUDGET_USD / EXA_COST_PER_REQUEST)
let exaRequests = 0
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
const EXA_KEY = env.EXA_API_KEY
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
  latest_stage: string | null
  latest_round_date: string | null
  total_raised_usd: number | null
  valuation_usd: number | null
  is_unicorn: boolean | null
  citations: string[]
  enriched_by: string | null
  note: string
}

/**
 * Funding, valuation and headcount from Exa's answer endpoint.
 *
 * ONE SOURCE PER FIGURE, NOT AN AVERAGE. Providers disagree — Razorpay's headcount
 * comes back as 3,465 / 4,035 / 4,486 / 4,665 depending on who you ask — and averaging
 * four guesses produces a fifth number nobody published. Every figure here feeds a
 * bucket ("unicorn", "Series B", "large"), where the spread makes no difference, so
 * one sourced answer beats a synthesised one. The citations are stored so it can be
 * checked rather than argued about.
 */
/**
 * Reduce "latest deal type" to a company STAGE a recruiter would recognise.
 *
 * The raw answer is whatever transaction happened most recently, which for an
 * established company is noise: Bain came back "Grant (prize money)", Meta "PIPE - II",
 * Goldman "Post IPO Debt". None of those describe the environment someone worked in,
 * which is the only reason the field exists. A debt raise or a secondary sale is not a
 * stage at all and becomes null rather than a misleading chip.
 */
export function normalizeStage(raw: string | null, isPublic: boolean | null): string | null {
  const v = (raw ?? '').toLowerCase()
  if (isPublic || /\b(ipo|publicly|post.?ipo|pipe|stock exchange)\b/.test(v)) return 'Public'
  const series = v.match(/series\s+([a-k])\b/)
  if (series) return `Series ${series[1].toUpperCase()}`
  if (/pre.?seed/.test(v)) return 'Pre-seed'
  if (/\bseed\b/.test(v)) return 'Seed'
  if (/\bangel\b/.test(v)) return 'Angel'
  if (/acqui(red|sition)|merger/.test(v)) return 'Acquired'
  if (/bootstrap/.test(v)) return 'Bootstrapped'
  if (/growth|late stage|private equity/.test(v)) return 'Growth'
  // Debt, grants, secondaries and prizes are transactions, not stages.
  return null
}

async function fromExa(employer: string, domain: string | null): Promise<Partial<Facts> | null> {
  if (!EXA_KEY) return null
  if (exaRequests >= MAX_EXA_REQUESTS) return null
  exaRequests++
  try {
    const res = await fetch('https://api.exa.ai/answer', {
      method: 'POST',
      headers: { 'x-api-key': EXA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          `${employer}${domain ? ` (${domain})` : ''} the company: latest funding round stage, ` +
          'date of that round, total funding raised in USD, current valuation in USD, ' +
          'whether it is a unicorn (valuation over $1B), year founded, current employee ' +
          'headcount, and its industries. Answer only for this company; if you cannot ' +
          'identify it, leave the fields empty.',
        outputSchema: {
          type: 'object',
          properties: {
            latest_stage: { type: 'string' },
            latest_round_date: { type: 'string' },
            total_raised_usd: { type: 'number' },
            valuation_usd: { type: 'number' },
            is_unicorn: { type: 'boolean' },
            founded_year: { type: 'number' },
            employees: { type: 'number' },
            industries: { type: 'array', items: { type: 'string' } },
          },
        },
      }),
    })
    if (!res.ok) return null
    const j = await res.json()
    const a = j?.answer
    if (!a || typeof a !== 'object') return null
    const year = Number(a.founded_year)
    return {
      latest_stage: typeof a.latest_stage === 'string' && a.latest_stage.trim() ? a.latest_stage.trim() : null,
      latest_round_date: /^\d{4}-\d{2}-\d{2}$/.test(String(a.latest_round_date)) ? String(a.latest_round_date) : null,
      total_raised_usd: Number.isFinite(a.total_raised_usd) ? Math.round(a.total_raised_usd) : null,
      valuation_usd: Number.isFinite(a.valuation_usd) ? Math.round(a.valuation_usd) : null,
      // Trust an explicit valuation over the model's own yes/no where we have one.
      is_unicorn: Number.isFinite(a.valuation_usd) ? a.valuation_usd >= 1_000_000_000 : (typeof a.is_unicorn === 'boolean' ? a.is_unicorn : null),
      founded_year: Number.isFinite(year) && year > 1800 && year <= new Date().getFullYear() ? year : null,
      employees: Number.isFinite(a.employees) && a.employees > 0 ? Math.round(a.employees) : null,
      industries: Array.isArray(a.industries) ? a.industries.filter((x: unknown) => typeof x === 'string').slice(0, 6) : [],
      citations: Array.isArray(j.citations) ? j.citations.map((c: { url?: string }) => c.url).filter(Boolean).slice(0, 5) : [],
    }
  } catch {
    return null
  }
}

/** Does the matched entity plausibly name the employer we asked about? */
function labelMatches(employer: string, label: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
  const a = norm(employer)
  const b = norm(label)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

/**
 * Free sources first, then Exa.
 *
 * Exa runs for EVERY employer rather than only the gaps, because funding history is
 * the one thing Wikidata and Wikipedia never carry — there is no cheaper source to try
 * first. It also fills whatever founding year, headcount or industry the free tiers
 * left blank, so a company with no Wikipedia article (Razorpay, Shadowfax) still comes
 * back with something.
 */
async function lookup(employer: string, domain: string | null): Promise<Facts> {
  const free = await lookupFree(employer)
  const exa = await fromExa(employer, domain)
  if (!exa) return free

  const merged: Facts = {
    ...free,
    // The free tiers win where they answered: Wikidata's claims are structured and
    // dated, Exa's are a model reading pages. Exa fills the blanks.
    founded_year: free.founded_year ?? exa.founded_year ?? null,
    employees: free.employees ?? exa.employees ?? null,
    industries: free.industries.length ? free.industries : (exa.industries ?? []),
    // "Unicorn" means a PRIVATE company valued over $1B. Google is worth two trillion
    // and is not a unicorn; calling it one makes the chip meaningless.
    latest_stage: normalizeStage(exa.latest_stage ?? null, free.is_public),
    latest_round_date: exa.latest_round_date ?? null,
    total_raised_usd: exa.total_raised_usd ?? null,
    valuation_usd: exa.valuation_usd ?? null,
    is_unicorn: null, // set below, once the stage is known
    citations: exa.citations ?? [],
  }
  // Suppress "unicorn" off the STAGE, not just Wikidata's public flag — that flag was
  // null for the "Facebook" entity while set for "Meta", which let a two-trillion-dollar
  // company through as a unicorn. A unicorn is a PRIVATE company valued over $1B.
  merged.is_unicorn = merged.latest_stage === 'Public' || free.is_public
    ? false
    : (exa.is_unicorn ?? null)

  const tiers = [free.wikidata_id ? 'wikidata' : null, free.note.includes('enwiki') ? 'enwiki' : null, 'exa'].filter(Boolean)
  merged.enriched_by = tiers.join('+')
  merged.note = free.note === 'no wikidata entity' && exa.latest_stage ? 'exa only' : free.note
  return merged
}

async function lookupFree(employer: string): Promise<Facts> {
  const base: Facts = {
    name_norm: normalizeName(employer, 'company'),
    display_name: null, wikidata_id: null, founded_year: null, employees: null,
    industries: [], country_code: null, is_public: null,
    latest_stage: null, latest_round_date: null, total_raised_usd: null,
    valuation_usd: null, is_unicorn: null, citations: [], enriched_by: null, note: '',
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
  // brand_domains already knows many employers' websites — handing Exa the domain
  // stops it answering about a different company with the same name.
  const domainRows = await get('brand_domains?select=name_norm,domain&kind=eq.company&limit=5000')
  const domainOf = new Map<string, string>(
    Array.isArray(domainRows)
      ? (domainRows as { name_norm: string; domain: string | null }[])
          .filter((r) => r.domain).map((r) => [r.name_norm, r.domain as string])
      : [],
  )

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
    try {
      facts = await lookup(employer, domainOf.get(normalizeName(employer, 'company')) ?? null)
    } catch (err) { console.log(`  !! ${employer} — ${(err as Error).message}`); break }
    if (facts.wikidata_id || facts.latest_stage || facts.employees) {
      found++
      const bits = [
        facts.industries.length ? facts.industries.slice(0, 2).join('/') : null,
        facts.founded_year ? `est ${facts.founded_year}` : null,
        facts.employees ? `${facts.employees.toLocaleString()} staff` : null,
        facts.latest_stage,
        facts.is_unicorn ? 'unicorn' : null,
        facts.is_public ? 'public' : null,
      ].filter(Boolean).join(' · ')
      console.log(`  ${String(count).padStart(3)}  ${employer.slice(0, 40).padEnd(42)} ${bits || '(no attributes)'}`)
    }
    // De-duplicate on the primary key before the batch: two spellings normalise to one.
    if (!rows.some((r) => r.name_norm === facts.name_norm)) rows.push(facts)
    await sleep(THROTTLE_MS)
  }

  console.log(`\n${found} of ${rows.length} employers resolved to a company.`)
  console.log(`   Exa requests: ${exaRequests} — about $${(exaRequests * EXA_COST_PER_REQUEST).toFixed(2)} of the $${BUDGET_USD} cap`)
  if (exaRequests >= MAX_EXA_REQUESTS) console.log('   !! budget cap reached — re-run to continue where it stopped')
  const withStage = rows.filter((r) => r.latest_stage).length
  const unicorns = rows.filter((r) => r.is_unicorn).length
  console.log(`   with a funding stage: ${withStage}   unicorns: ${unicorns}`)
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
