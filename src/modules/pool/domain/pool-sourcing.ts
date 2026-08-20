import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, Database } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'
import { icpEmbeddingText } from '@/lib/ai/embeddings'
import { embedText } from '@/lib/ai/llm'
import { scoreAgainstIcp } from '@/lib/ai/fit-engine'
import { getPoolAccess } from '@/modules/pool/domain/pool'
import type { UsageIdentity } from '@/lib/ai/track-usage'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// pool_* tables (migration 115) aren't in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const SHORTLIST = 20
const CONCURRENCY = 5

export interface PoolMatch {
  profile_id: string
  name: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  reachable: boolean
  experience_years: number | null
  total_experience_months: number | null
  current_tenure_months: number | null
  skills: string[]
  score: number
  fit_bucket: string
  rationale: string
  gate_failures: string[]
}

/** Build the Candidate shape the Fit Engine reads from a pool profile row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poolProfileToFitCandidate(p: any): Candidate {
  return {
    name: p.display_name ?? 'Candidate',
    current_title: p.current_title ?? null,
    location: p.location_city ?? p.location_raw ?? null,
    skills: p.skills ?? [],
    experience_years: p.experience_years ?? null,
  } as unknown as Candidate
}

/**
 * Sourcing over the cross-org Candidate Pool (Pool B). Semantic recall against the
 * pool by the job's ICP, then Fit-Engine scored — the same brain as Pool A, over the
 * market. Excludes profiles this org has already unlocked. Degrades gracefully: no
 * pool subscription, no embeddings, or an empty pool all return no matches, never an error.
 */
export async function sourcePoolForIcp(
  supabase: Supabase,
  orgId: string,
  icp: Icp,
  identity: UsageIdentity = {},
): Promise<{ status: 'ok' | 'no_access' | 'empty'; matches: PoolMatch[] }> {
  const access = await getPoolAccess(supabase, orgId)
  if (!access.hasAccess) return { status: 'no_access', matches: [] }
  const sb = supabase as unknown as LooseSb

  const { data: unlocked } = await sb.from('pool_unlocks').select('profile_id').eq('org_id', orgId)
  const excludeIds = (unlocked ?? []).map((r: { profile_id: string }) => r.profile_id)

  let ids: string[] = []
  try {
    const query = await embedText(icpEmbeddingText(icp))
    const { data, error } = await sb.rpc('match_pool_profiles', {
      query_embedding: query,
      match_count: SHORTLIST,
      exclude_ids: excludeIds,
      only_reachable: false,
    })
    if (error) throw error
    ids = (data ?? []).map((r: { id: string }) => r.id)
  } catch (err) {
    logger.warn('Pool semantic recall failed', { error: err instanceof Error ? err.message : String(err) })
    return { status: 'ok', matches: [] }
  }
  if (!ids.length) return { status: 'empty', matches: [] }

  const { data: profiles } = await sb
    .from('pool_profiles')
    .select('id, display_name, current_title, current_company, location_city, location_raw, skills, experience_years, total_experience_months, current_tenure_months, reachable')
    .in('id', ids)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean)

  // Dated work history per profile, so background deal-breakers are judged on real
  // roles held — not the current title alone (market profiles are often the thinnest).
  const { data: pexps } = await sb
    .from('pool_experiences')
    .select('profile_id, title, employer, start_date, end_date, is_current, sort_order')
    .in('profile_id', ids).order('sort_order', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expsByProfile = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (pexps ?? []) as any[]) {
    const arr = expsByProfile.get(e.profile_id) ?? []
    arr.push({ title: e.title, employer: e.employer, start_date: e.start_date, end_date: e.end_date, is_current: e.is_current })
    expsByProfile.set(e.profile_id, arr)
  }

  const matches: PoolMatch[] = []
  for (let i = 0; i < ordered.length; i += CONCURRENCY) {
    const chunk = ordered.slice(i, i + CONCURRENCY)
    const scored = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chunk.map(async (p: any) => {
        try {
          // Market candidates: assume complete vendor data → REJECT when it's missing.
          const fit = await scoreAgainstIcp(poolProfileToFitCandidate(p), icp, identity, undefined, { experiences: expsByProfile.get(p.id) ?? [] }, 'reject')
          return {
            profile_id: p.id,
            name: p.display_name,
            current_title: p.current_title,
            current_company: p.current_company,
            location: p.location_city ?? p.location_raw ?? null,
            reachable: !!p.reachable,
            experience_years: p.experience_years ?? null,
            total_experience_months: p.total_experience_months ?? null,
            current_tenure_months: p.current_tenure_months ?? null,
            skills: p.skills ?? [],
            score: fit.score,
            fit_bucket: fit.fit_bucket,
            rationale: fit.rationale,
            gate_failures: fit.gate_failures.map((g) => g.label),
          } as PoolMatch
        } catch {
          return null
        }
      }),
    )
    for (const m of scored) if (m) matches.push(m)
  }
  matches.sort((a, b) => b.score - a.score)
  return { status: 'ok', matches }
}

/** Persist the market shortlist so it survives a refresh (and avoids re-scoring). */
export async function savePoolMatches(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  icpVersion: number | null,
  matches: PoolMatch[],
): Promise<void> {
  await (supabase as unknown as LooseSb)
    .from('pool_sourcing_matches')
    .upsert(
      { org_id: orgId, job_id: jobId, icp_version: icpVersion, matches, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,job_id' },
    )
}

/** The cached market shortlist for a job (for on-mount load). Null if none / table
 *  not there yet. Flags stale when the ICP has moved past the cached version. */
export async function getCachedPoolMatches(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  currentIcpVersion: number | null,
): Promise<{ matches: PoolMatch[]; stale: boolean; updated_at: string } | null> {
  try {
    const { data, error } = await (supabase as unknown as LooseSb)
      .from('pool_sourcing_matches')
      .select('matches, icp_version, updated_at')
      .eq('org_id', orgId)
      .eq('job_id', jobId)
      .maybeSingle()
    if (error || !data) return null
    return {
      matches: (data.matches ?? []) as PoolMatch[],
      stale: currentIcpVersion != null && data.icp_version != null && data.icp_version !== currentIcpVersion,
      updated_at: data.updated_at,
    }
  } catch {
    return null
  }
}
