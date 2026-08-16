import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { getPoolAccess } from '@/modules/pool/domain/pool'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/**
 * Projecting a pool profile into a per-org candidate is inherently cross-module:
 * `pool` owns the source record, `ats` owns `candidates`. Rather than importing
 * the sibling (which the boundary rule forbids — see
 * docs/platform-modular-architecture.md), the caller injects the projection. The
 * API route is the composition layer and may import both modules freely.
 */
export interface CandidateProjectionInput {
  name: string
  email: string
  phone: string | null
  resume_url: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  linkedin_url: string | null
  skills: string[]
  experience_years: number
}
export type ProjectCandidate = (
  supabase: Supabase,
  orgId: string,
  input: CandidateProjectionInput,
) => Promise<{ id: string }>

export type UnlockResult =
  | { status: 'unlocked' | 'already'; candidate_id: string }
  | { status: 'no_access' | 'quota_exceeded' | 'not_found' }
  | { status: 'error'; message: string }

/**
 * Spend an unlock to bring a Pool B profile into this org's ATS (Sourcing Brain —
 * the bridge between the two pools). Idempotent per (org, profile). Projects the
 * cross-org pool profile into a per-org `candidate`, copying the dated history into
 * `candidate_experiences` (same shape), records the unlock, and spends quota.
 */
export async function unlockPoolProfile(
  supabase: Supabase,
  orgId: string,
  profileId: string,
  userId: string | null | undefined,
  projectCandidate: ProjectCandidate,
): Promise<UnlockResult> {
  const access = await getPoolAccess(supabase, orgId)
  if (!access.hasAccess) return { status: 'no_access' }
  const sb = supabase as unknown as LooseSb

  // Idempotent — already unlocked → return the existing projection.
  const { data: existing } = await sb
    .from('pool_unlocks').select('candidate_id').eq('org_id', orgId).eq('profile_id', profileId).maybeSingle()
  if (existing?.candidate_id) return { status: 'already', candidate_id: existing.candidate_id }

  if (access.unlockQuota != null && (access.unlocksUsed ?? 0) >= access.unlockQuota) {
    return { status: 'quota_exceeded' }
  }

  const { data: profile } = await sb.from('pool_profiles').select('*').eq('id', profileId).maybeSingle()
  if (!profile) return { status: 'not_found' }

  const { data: contacts } = await sb.from('pool_contacts').select('kind, value').eq('profile_id', profileId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const email = (contacts ?? []).find((c: any) => c.kind === 'email')?.value
    ?? `pool-${profileId}@unlocked.recruiterstack.in` // candidate identity needs an email; placeholder if none
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedin = (contacts ?? []).find((c: any) => c.kind === 'linkedin')?.value ?? null

  try {
    const result = await projectCandidate(supabase, orgId, {
      name: profile.display_name ?? 'Candidate',
      email,
      phone: null,
      resume_url: null,
      current_title: profile.current_title ?? null,
      current_company: profile.current_company ?? null,
      location: profile.location_city ?? profile.location_raw ?? null,
      linkedin_url: linkedin,
      skills: profile.skills ?? [],
      experience_years: typeof profile.experience_years === 'number' ? Math.round(profile.experience_years) : 0,
    })
    const candidateId = result.id

    // Copy the dated history (identical shape) + education into the per-org store.
    const { data: exps } = await sb.from('pool_experiences').select('*').eq('profile_id', profileId).order('sort_order', { ascending: true })
    if ((exps ?? []).length) {
      await sb.from('candidate_experiences').delete().eq('candidate_id', candidateId).eq('org_id', orgId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('candidate_experiences').insert((exps as any[]).map((e, i) => ({
        org_id: orgId, candidate_id: candidateId, title: e.title, employer: e.employer, location: e.location,
        start_date: e.start_date, end_date: e.end_date, is_current: e.is_current, summary: e.summary, sort_order: e.sort_order ?? i,
      })))
    }
    await sb.from('candidates').update({ education: profile.education ?? [], enriched_at: new Date().toISOString() }).eq('id', candidateId).eq('org_id', orgId)

    // Record the unlock + spend quota.
    await sb.from('pool_unlocks').insert({ org_id: orgId, profile_id: profileId, user_id: userId ?? null, candidate_id: candidateId })
    await sb.from('pool_access_grants').update({ unlocks_used: (access.unlocksUsed ?? 0) + 1 }).eq('org_id', orgId)

    return { status: 'unlocked', candidate_id: candidateId }
  } catch (err) {
    logger.error('Pool unlock failed', err, { orgId, profileId })
    return { status: 'error', message: err instanceof Error ? err.message : 'unlock failed' }
  }
}
