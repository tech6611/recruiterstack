/**
 * The Scoring tab's SAMPLE PERSON per bet: the best real person in the Candidate Pool
 * for one bet's companies + titles + profile lines, the recruiter's 👍 / 👎 on them,
 * and — only when asked — a small paid Crustdata search aimed at that one bet.
 *
 * Free by default: the pool query and the ✓ / ✗ checks read stored data only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { SearchCriterion, SearchSpec } from '@/lib/types/search-spec'
import { groupEmployerAliases } from '@/lib/employer-aliases'
import { rankBetSamples, companyQueryTerms, hasWords, type BetSamplePerson, type BetCheck } from '@/modules/pool/domain/bet-sample-fit'
import { compileSpec } from '@/modules/pool/vendors/crustdata/compile-spec'
import { isPlanRunnable } from '@/modules/pool/vendors/crustdata/search-plan'
import { sourceFromCrustdata } from '@/modules/pool/domain/crustdata-acquire'
import { embedPoolProfiles } from '@/modules/pool/domain/pool-sourcing'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const PERSON_COLS = 'id, display_name, headline, current_title, current_company, location_raw, location_city, location_region, location_country_code, experience_years, skills, education, reachable'
/** How many pool rows at the bet's companies are checked per request. */
const CANDIDATE_LIMIT = 400
/** People fetched by one "Find one in the market" click (~0.03 credit each). */
export const MARKET_BATCH = 5
export const CREDITS_PER_PERSON = 0.03

export interface BetSampleResult {
  person: BetSamplePerson | null
  checks: BetCheck[]
  /** People at the bet's companies still to show after this one. */
  remaining: number
  /** Already marked for this bet on this job. */
  decided: { yes: number; no: number }
  /** Why there is nobody, when there is nobody. */
  reason: 'no_companies' | 'none_at_companies' | 'all_seen' | null
}

async function decidedFor(supabase: Supabase, orgId: string, jobId: string, bet: number) {
  const { data } = await (supabase as unknown as LooseSb)
    .from('bet_sample_decisions').select('profile_id, decision')
    .eq('org_id', orgId).eq('job_id', jobId).eq('bet', bet)
  const rows = (data ?? []) as { profile_id: string; decision: string }[]
  return {
    ids: new Set(rows.map((r) => r.profile_id)),
    yes: rows.filter((r) => r.decision === 'yes').length,
    no: rows.filter((r) => r.decision === 'no').length,
  }
}

/**
 * The best pool person for one bet. `criteria` is the bet's companies + titles rows and
 * its profile lines (shared, or its own) — sent from the editor, so unsaved edits count.
 * `skip` = people already shown this session (so "Show another" moves on).
 */
export async function findBetSample(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  bet: number,
  criteria: SearchCriterion[],
  skip: string[] = [],
): Promise<BetSampleResult> {
  const decided = await decidedFor(supabase, orgId, jobId, bet)
  const tally = { yes: decided.yes, no: decided.no }
  const employer = criteria.find((c) => c.kind.startsWith('employer_') && !c.exclude)
  const companies = employer ? groupEmployerAliases(employer.values).flatMap((g) => g.members) : []
  const terms = companyQueryTerms(companies)
  if (!terms.length) return { person: null, checks: [], remaining: 0, decided: tally, reason: 'no_companies' }

  const { data, error } = await (supabase as unknown as LooseSb)
    .from('pool_profiles').select(PERSON_COLS)
    .or(terms.map((t) => `current_company.ilike.*${t}*`).join(','))
    .order('reachable', { ascending: false })
    .limit(CANDIDATE_LIMIT)
  if (error) throw error
  // The ilike is a substring match ("Bain" in "Bainbridge"); keep whole-word hits only.
  const atCompanies = ((data ?? []) as BetSamplePerson[]).filter((p) => terms.some((t) => hasWords(p.current_company, t)))
  if (!atCompanies.length) return { person: null, checks: [], remaining: 0, decided: tally, reason: 'none_at_companies' }

  const skipped = new Set(skip)
  const fresh = atCompanies.filter((p) => !decided.ids.has(p.id) && !skipped.has(p.id))
  if (!fresh.length) return { person: null, checks: [], remaining: 0, decided: tally, reason: 'all_seen' }

  const [best, ...rest] = rankBetSamples(fresh, criteria)
  return { person: best.person, checks: best.checks, remaining: rest.length, decided: tally, reason: null }
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

/**
 * The one-bet market search: the bet's companies + titles, with its profile lines
 * ANDed in. Returns null when nothing in the bet can be sent to Crustdata. PURE.
 */
export function betMarketSpec(criteria: SearchCriterion[]): SearchSpec | null {
  const lane = criteria.filter((c) => c.kind.startsWith('employer_') || c.kind.startsWith('title_'))
  if (!lane.some((c) => c.kind.startsWith('employer_'))) return null
  const base = criteria.filter((c) => !lane.includes(c))
  return { version: 1, base, levels: [{ id: 'L1', label: 'This bet', criteria: lane }], post_fetch: [], source: 'edited' }
}

/** Spend a few credits to pull people for one bet into the pool. */
export async function marketSearchForBet(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  criteria: SearchCriterion[],
): Promise<{ fetched: number; creditsUsed: number }> {
  const spec = betMarketSpec(criteria)
  const plan = spec ? compileSpec(spec) : null
  if (!plan || !isPlanRunnable(plan)) throw new Error('This bet has no companies to search for.')
  const res = await sourceFromCrustdata(supabase, { filters: plan.lanes[0].filters, perPage: MARKET_BATCH, maxRecords: MARKET_BATCH, orgId, jobId })
  // Embedded like any other fetch, so they also rank in the Source tab's search.
  const ids = res.ingest.outcomes.filter((o) => o.status === 'ingested').map((o) => o.profileId)
  if (ids.length) await embedPoolProfiles(supabase, ids).catch(() => 0)
  return { fetched: res.fetched, creditsUsed: res.creditsUsed }
}
