import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { getSourcingMatches } from '@/modules/ats/domain/sourcing'
import { getCachedPoolMatches, type PoolMatch } from '@/modules/pool/domain/pool-sourcing'

type Supabase = SupabaseClient<Database>

export interface BriefItem {
  source: 'yours' | 'market'
  ref_id: string // candidate_id (yours) | profile_id (market)
  name: string
  title: string | null
  company: string | null
  location: string | null
  score: number
  fit_bucket: string
  rationale: string
  gate_failures: string[]
  reachable?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gateLabels(g: any): string[] {
  if (!Array.isArray(g)) return []
  return g.map((x) => (typeof x === 'string' ? x : x?.label)).filter(Boolean)
}

/**
 * Merge the two pools into one ranked shortlist. PURE + tested — the ranking-across-
 * pools logic the recruiter brief is built on.
 */
export function buildShortlist(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poolA: any[],
  poolB: PoolMatch[],
  limit = 20,
): BriefItem[] {
  const yours: BriefItem[] = (poolA ?? []).map((m) => ({
    source: 'yours' as const,
    ref_id: m.candidate_id,
    name: m.candidate?.name ?? 'Candidate',
    title: m.candidate?.current_title ?? null,
    company: m.candidate?.current_company ?? null,
    location: m.candidate?.location ?? null,
    score: m.score ?? 0,
    fit_bucket: m.fit_bucket ?? 'okay',
    rationale: m.rationale ?? '',
    gate_failures: gateLabels(m.gate_failures),
  }))

  const market: BriefItem[] = (poolB ?? []).map((m) => ({
    source: 'market' as const,
    ref_id: m.profile_id,
    name: m.name ?? 'Candidate',
    title: m.current_title,
    company: m.current_company,
    location: m.location,
    score: m.score,
    fit_bucket: m.fit_bucket,
    rationale: m.rationale,
    gate_failures: m.gate_failures ?? [],
    reachable: m.reachable,
  }))

  return [...yours, ...market].sort((a, b) => b.score - a.score).slice(0, limit)
}

export function shortlistCounts(items: BriefItem[]) {
  return {
    total: items.length,
    yours: items.filter((i) => i.source === 'yours').length,
    market: items.filter((i) => i.source === 'market').length,
    great: items.filter((i) => i.fit_bucket === 'great').length,
    good: items.filter((i) => i.fit_bucket === 'good').length,
    okay: items.filter((i) => i.fit_bucket === 'okay').length,
  }
}

export interface Brief {
  role_title: string | null
  reasoning: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unwritten_filters: any[]
  archetypes: NonNullable<Icp['sourcing_map']>['archetypes']
  shortlist: BriefItem[]
  counts: ReturnType<typeof shortlistCounts>
  has_market: boolean
  market_stale?: boolean
}

/**
 * Assemble the recruiter brief for a job (Sourcing Brain, Slice 1b): the ICP
 * reasoning + a single shortlist ranked across your own candidates and the market.
 *
 * Reads BOTH sides from their caches (own-pool `sourcing_matches` + the market
 * `pool_sourcing_matches`) — no re-scoring. That makes it (a) cheap enough to load
 * on mount so it survives a refresh, and (b) consistent with the "Source the market"
 * section, since it uses the exact same cached market run rather than a fresh
 * (non-deterministic) one.
 */
export async function assembleBrief(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  roleTitle: string | null,
): Promise<{ status: 'ok' | 'no_icp'; brief?: Brief }> {
  const icp = await getCurrentIcp(supabase, orgId, jobId).catch(() => null)
  if (!icp || icp.status !== 'approved') return { status: 'no_icp' }

  const poolA = await getSourcingMatches(supabase, orgId, jobId).catch(() => [])
  const cachedMarket = await getCachedPoolMatches(supabase, orgId, jobId, (icp as Icp).version).catch(() => null)
  const poolB = cachedMarket?.matches ?? []

  const shortlist = buildShortlist(poolA, poolB)
  const sm = (icp as Icp).sourcing_map

  return {
    status: 'ok',
    brief: {
      role_title: roleTitle,
      reasoning: sm?.reasoning ?? null,
      unwritten_filters: sm?.unwritten_filters ?? [],
      archetypes: sm?.archetypes ?? [],
      shortlist,
      counts: shortlistCounts(shortlist),
      has_market: poolB.length > 0,
      market_stale: cachedMarket?.stale ?? false,
    },
  }
}
