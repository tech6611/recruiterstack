import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export interface PoolUsage {
  access: {
    tier: string
    quota: number | null // null = unlimited
    used: number
    remaining: number | null
    active: boolean
    expires_at: string | null
  } | null
  unlocks: {
    profile_id: string
    candidate_id: string | null
    unlocked_at: string
    name: string
    title: string | null
    in_pipeline: boolean
  }[]
  total_unlocks: number
}

/**
 * Candidate-pool usage for an org (Sourcing Brain — unlock tracking): the subscription
 * tier + quota, how many unlocks are spent/remaining, and the full unlock history with
 * the candidate each one became. Data already captured in pool_access_grants +
 * pool_unlocks; this just surfaces it.
 */
export async function getPoolUsage(supabase: Supabase, orgId: string): Promise<PoolUsage> {
  const sb = supabase as unknown as LooseSb

  const { data: grant } = await sb
    .from('pool_access_grants')
    .select('tier, unlock_quota, unlocks_used, active, expires_at')
    .eq('org_id', orgId)
    .maybeSingle()

  const access = grant
    ? {
        tier: grant.tier,
        quota: grant.unlock_quota ?? null,
        used: grant.unlocks_used ?? 0,
        remaining: grant.unlock_quota == null ? null : Math.max(0, grant.unlock_quota - (grant.unlocks_used ?? 0)),
        active: !!grant.active,
        expires_at: grant.expires_at ?? null,
      }
    : null

  const { data: rows } = await sb
    .from('pool_unlocks')
    .select('profile_id, candidate_id, unlocked_at, candidates(name, current_title, status)')
    .eq('org_id', orgId)
    .order('unlocked_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unlocks = (rows ?? []).map((u: any) => ({
    profile_id: u.profile_id,
    candidate_id: u.candidate_id,
    unlocked_at: u.unlocked_at,
    name: u.candidates?.name ?? 'Candidate',
    title: u.candidates?.current_title ?? null,
    in_pipeline: !!u.candidate_id,
  }))

  return { access, unlocks, total_unlocks: unlocks.length }
}
