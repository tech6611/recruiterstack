/**
 * The Scoring tab's SAMPLE PERSON per bet, fetched LIVE from Crustdata with exactly the
 * bet's lines — its companies, titles, location, years, school and any "only this bet"
 * line. One card ↔ one bet ↔ one search: BCG alone on the left means BCG people only on
 * the right; adding EY-Parthenon makes the next search include it.
 *
 * Paid, so: a small page at a time (BATCH people), each distinct set of lines searched
 * once and remembered (bet_sample_searches — a reload or going back to lines already
 * searched never pays twice), and a per-job cap on credits spent in the last 24 hours
 * (bet_sample_spend). Fetched people land in the Candidate Pool like any other fetch.
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { SearchCriterion, SearchSpec } from '@/lib/types/search-spec'
import { rankBetSamples, hasWords, type BetSamplePerson, type BetCheck } from '@/modules/pool/domain/bet-sample-fit'
import { groupEmployerAliases } from '@/lib/employer-aliases'
import { compileSpec } from '@/modules/pool/vendors/crustdata/compile-spec'
import { isPlanRunnable } from '@/modules/pool/vendors/crustdata/search-plan'
import { searchPeople, crustdataConfigured, CrustdataConfigError, type CrustdataFilters } from '@/modules/pool/vendors/crustdata/client'
import { ingestVendorRecords } from '@/modules/pool/domain/ingest'
import { startIngestRun, finishIngestRun, recordVendorCall } from '@/modules/pool/domain/vendor-ledger'
import { embedPoolProfiles } from '@/modules/pool/domain/pool-sourcing'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const SOURCE = 'vendor:crustdata'
const PERSON_COLS = 'id, display_name, headline, current_title, current_company, location_raw, location_city, location_region, location_country_code, experience_years, skills, education, reachable'
/** People fetched per paid page (~0.03 credit each). */
export const BATCH = 3
/** Credits one job may spend on sample people in any 24 hours. */
export const DAILY_CAP_CREDITS = 5
/** Pages tried in one request when a page brings nobody new (duplicates, unusable records). */
const MAX_PAGES_PER_REQUEST = 2

export interface BetSampleResult {
  person: BetSamplePerson | null
  checks: BetCheck[]
  /** Fetched people for these lines still to show (more may be fetched after them). */
  remaining: number
  /** How many people the market has for these lines (null when unknown). */
  total: number | null
  /** Already marked for this bet on this job. */
  decided: { yes: number; no: number }
  /** Credits this job spent on sample people in the last 24 hours, and the cap. */
  spent: number
  cap: number
  /** Why there is nobody, when there is nobody. */
  reason: 'no_companies' | 'none' | 'all_seen' | 'cap' | 'unavailable' | null
  message?: string | null
}

/** One remembered search: a bet's lines and what the market returned for them. */
export interface SearchRow {
  fingerprint: string
  criteria: SearchCriterion[]
  profile_ids: string[]
  next_cursor: string | null
  total: number | null
  exhausted: boolean
  credits: number
}

export interface PageResult { profileIds: string[]; nextCursor: string | null; total: number | null; credits: number }

/** What the sample needs from the database — an interface, so the logic is testable without one. */
export interface SampleStore {
  decided(): Promise<{ ids: Set<string>; yes: number; no: number }>
  loadSearch(fingerprint: string): Promise<SearchRow | null>
  saveSearch(row: SearchRow): Promise<void>
  spentLast24h(): Promise<number>
  logSpend(credits: number, people: number): Promise<void>
  loadPeople(ids: string[]): Promise<BetSamplePerson[]>
}

/**
 * What identifies a search: the lines as searched (kinds, values, bands, radius,
 * exclusions) — not their ids, labels or order. PURE.
 */
export function betFingerprint(criteria: SearchCriterion[]): string {
  const norm = criteria
    .map((c) => JSON.stringify([
      c.kind,
      c.values.map((v) => v.trim().toLowerCase()).filter(Boolean).sort(),
      c.min ?? null, c.max ?? null, c.radius_km ?? null, !!c.exclude,
    ]))
    .sort()
  return createHash('sha1').update(norm.join('\n')).digest('hex')
}

/**
 * The bet's one market search: its companies + titles, with its other lines ANDed in.
 * Null when nothing in the bet can be sent to Crustdata. PURE.
 */
export function betMarketSpec(criteria: SearchCriterion[]): SearchSpec | null {
  const lane = criteria.filter((c) => c.kind.startsWith('employer_') || c.kind.startsWith('title_'))
  if (!lane.some((c) => c.kind.startsWith('employer_'))) return null
  const base = criteria.filter((c) => !lane.includes(c))
  return { version: 1, base, levels: [{ id: 'L1', label: 'This bet', criteria: lane }], post_fetch: [], source: 'edited' }
}

/**
 * The next sample person for one bet's lines. Uses people already fetched for exactly
 * these lines first; fetches the next page only when they have all been seen or
 * decided, the market has more, and the job is under its daily cap.
 */
export async function nextBetSample(
  store: SampleStore,
  fetchPage: (filters: CrustdataFilters, cursor: string | null) => Promise<PageResult>,
  criteria: SearchCriterion[],
  skip: string[] = [],
  cap = DAILY_CAP_CREDITS,
): Promise<BetSampleResult> {
  const decided = await store.decided()
  const tally = { yes: decided.yes, no: decided.no }
  const spec = betMarketSpec(criteria)
  const plan = spec ? compileSpec(spec) : null
  let spent = await store.spentLast24h()
  const empty = (reason: BetSampleResult['reason'], total: number | null = null, message: string | null = null): BetSampleResult =>
    ({ person: null, checks: [], remaining: 0, total, decided: tally, spent, cap, reason, message })
  if (!plan || !isPlanRunnable(plan)) return empty('no_companies')

  const fingerprint = betFingerprint(criteria)
  const skipped = new Set(skip)
  const unseen = (ids: string[]) => ids.filter((id) => !decided.ids.has(id) && !skipped.has(id))
  let row: SearchRow = (await store.loadSearch(fingerprint)) ?? { fingerprint, criteria, profile_ids: [], next_cursor: null, total: null, exhausted: false, credits: 0 }

  for (let page = 0; unseen(row.profile_ids).length === 0 && !row.exhausted && page < MAX_PAGES_PER_REQUEST; page++) {
    if (spent >= cap) return empty('cap', row.total)
    let res: PageResult
    try {
      res = await fetchPage(plan.lanes[0].filters, row.next_cursor)
    } catch (e) {
      return empty('unavailable', row.total, e instanceof Error ? e.message : String(e))
    }
    const known = new Set(row.profile_ids)
    row = {
      ...row,
      criteria,
      profile_ids: [...row.profile_ids, ...res.profileIds.filter((id) => !known.has(id))],
      next_cursor: res.nextCursor,
      total: res.total ?? row.total,
      // A short page, or no cursor, means the market has nothing more for these lines.
      exhausted: !res.nextCursor || res.profileIds.length < BATCH,
      credits: row.credits + res.credits,
    }
    await store.saveSearch(row)
    if (res.credits > 0) await store.logSpend(res.credits, res.profileIds.length)
    spent += res.credits
  }

  const ids = unseen(row.profile_ids)
  if (!ids.length) return empty(row.total === 0 || !row.profile_ids.length ? 'none' : 'all_seen', row.total)
  // In the market's order; a line the market could not filter on (checked after) may
  // move someone down.
  const people = await store.loadPeople(ids)
  const byId = new Map(people.map((p) => [p.id, p]))
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is BetSamplePerson => !!p)
  if (!ordered.length) return empty('all_seen', row.total)
  const [best, ...rest] = rankBetSamples(ordered, criteria)
  return { person: best.person, checks: best.checks, remaining: rest.length, total: row.total, decided: tally, spent, cap, reason: null }
}

/** The database behind nextBetSample for one job + bet. */
export function supabaseSampleStore(supabase: Supabase, orgId: string, jobId: string, bet: number): SampleStore {
  const sb = supabase as unknown as LooseSb
  return {
    async decided() {
      const { data } = await sb.from('bet_sample_decisions').select('profile_id, decision').eq('org_id', orgId).eq('job_id', jobId).eq('bet', bet)
      const rows = (data ?? []) as { profile_id: string; decision: string }[]
      return { ids: new Set(rows.map((r) => r.profile_id)), yes: rows.filter((r) => r.decision === 'yes').length, no: rows.filter((r) => r.decision === 'no').length }
    },
    async loadSearch(fingerprint) {
      const { data, error } = await sb.from('bet_sample_searches').select('fingerprint, criteria, profile_ids, next_cursor, total, exhausted, credits')
        .eq('org_id', orgId).eq('job_id', jobId).eq('bet', bet).eq('fingerprint', fingerprint).maybeSingle()
      if (error) throw error
      return data ? { ...data, credits: Number(data.credits) || 0 } as SearchRow : null
    },
    async saveSearch(row) {
      const { error } = await sb.from('bet_sample_searches').upsert({
        org_id: orgId, job_id: jobId, bet, ...row, updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,job_id,bet,fingerprint' })
      if (error) throw error
    },
    async spentLast24h() {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { data, error } = await sb.from('bet_sample_spend').select('credits').eq('org_id', orgId).eq('job_id', jobId).gte('spent_at', since)
      if (error) throw error
      return ((data ?? []) as { credits: number | string }[]).reduce((s, r) => s + (Number(r.credits) || 0), 0)
    },
    async logSpend(credits, people) {
      const { error } = await sb.from('bet_sample_spend').insert({ org_id: orgId, job_id: jobId, bet, credits, people })
      if (error) throw error
    },
    async loadPeople(ids) {
      if (!ids.length) return []
      const { data, error } = await sb.from('pool_profiles').select(PERSON_COLS).in('id', ids)
      if (error) throw error
      return (data ?? []) as BetSamplePerson[]
    },
  }
}

/**
 * The titles real people at these companies hold today, most common first — evidence for
 * the recruiter brain when it writes a bet's titles. Free: the Candidate Pool only.
 */
export async function observedTitlesAt(supabase: Supabase, companies: string[]): Promise<{ title: string; count: number }[]> {
  const terms = Array.from(new Set(groupEmployerAliases(companies).flatMap((g) => g.members)
    .map((v) => v.replace(/[^A-Za-z0-9&\s.-]/g, ' ').replace(/\s+/g, ' ').trim()).filter((v) => v.length >= 2))).slice(0, 40)
  if (!terms.length) return []
  const { data, error } = await (supabase as unknown as LooseSb).from('pool_profiles').select('current_title, current_company')
    .or(terms.map((t) => `current_company.ilike.*${t}*`).join(',')).limit(1000)
  if (error) throw error
  const counts = new Map<string, number>()
  for (const p of (data ?? []) as { current_title: string | null; current_company: string | null }[]) {
    if (!p.current_title || !terms.some((t) => hasWords(p.current_company, t))) continue
    const t = p.current_title.trim().replace(/\s+/g, ' ')
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 60)
}

/** One paid page from Crustdata for a bet's search, ingested into the pool and logged. */
export function crustdataPageFetcher(supabase: Supabase, orgId: string, jobId: string) {
  const sb = supabase as unknown as LooseSb
  return async (filters: CrustdataFilters, cursor: string | null): Promise<PageResult> => {
    if (!crustdataConfigured()) throw new CrustdataConfigError('The market source is not configured (missing API key).')
    const { data: src } = await sb.from('pool_sources').select('enabled').eq('key', SOURCE).maybeSingle()
    if (!src?.enabled) throw new Error('Market sourcing is not enabled for this workspace yet.')
    const runId = await startIngestRun(supabase, { sourceKey: SOURCE, orgId, jobId, query: { kind: 'bet_sample', filters, cursor } })
    try {
      const page = await searchPeople(filters, { limit: BATCH, cursor })
      await recordVendorCall(supabase, { sourceKey: SOURCE, endpoint: 'search', orgId, runId, ok: true, credits: Math.ceil(page.creditsUsed), recordsReturned: page.profiles.length })
      const ingest = await ingestVendorRecords(supabase, SOURCE, page.profiles, { runId, creditsPerRecord: page.profiles.length ? page.creditsUsed / page.profiles.length : 0 })
      const profileIds = ingest.outcomes.flatMap((o) => (o.status === 'ingested' ? [o.profileId] : []))
      await finishIngestRun(supabase, runId, {
        ids_matched: page.totalCount ?? page.profiles.length, ids_bought: page.profiles.length,
        profiles_created: ingest.created, profiles_merged: ingest.merged, records_unusable: ingest.unusable, credits_used: Math.ceil(page.creditsUsed),
      })
      // Embedded like any other fetch, so they also rank on the Source tab.
      if (profileIds.length) await embedPoolProfiles(supabase, profileIds).catch(() => 0)
      return { profileIds, nextCursor: page.nextCursor, total: page.totalCount, credits: page.creditsUsed }
    } catch (e) {
      await finishIngestRun(supabase, runId, { error: e instanceof Error ? e.message : String(e) }).catch(() => undefined)
      throw e
    }
  }
}

/** The sample for one job's bet, live. */
export async function findBetSample(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  bet: number,
  criteria: SearchCriterion[],
  skip: string[] = [],
): Promise<BetSampleResult> {
  return nextBetSample(supabaseSampleStore(supabase, orgId, jobId, bet), crustdataPageFetcher(supabase, orgId, jobId), criteria, skip)
}

/** Record 👍 / 👎 on a sample person (deciding again replaces the verdict). */
export async function decideBetSample(
  supabase: Supabase,
  orgId: string,
  input: {
    jobId: string
    bet: number
    betLabel: string | null
    profileId: string
    decision: 'yes' | 'no'
    criteria: SearchCriterion[]
    checks: BetCheck[]
    icpId: string | null
    decidedBy: string | null
  },
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const { data: p } = await sb.from('pool_profiles').select(PERSON_COLS).eq('id', input.profileId).maybeSingle()
  if (!p) throw new Error('That person is no longer in the pool')
  const person = p as BetSamplePerson
  const { error } = await sb.from('bet_sample_decisions').upsert({
    org_id: orgId,
    job_id: input.jobId,
    bet: input.bet,
    bet_label: input.betLabel,
    profile_id: input.profileId,
    decision: input.decision,
    icp_id: input.icpId,
    criteria: input.criteria,
    checks: input.checks,
    // A frozen snapshot: the pool row is rebuilt as sources change.
    person: {
      current_title: person.current_title, current_company: person.current_company,
      experience_years: person.experience_years, location: person.location_city ?? person.location_raw,
      education: person.education ?? [], skills: person.skills ?? [],
    },
    decided_by: input.decidedBy,
    decided_at: new Date().toISOString(),
  }, { onConflict: 'org_id,job_id,bet,profile_id' })
  if (error) throw error
}
