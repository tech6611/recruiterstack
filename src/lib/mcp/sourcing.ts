/**
 * Crustdata sourcing for AI assistants — the same flow as the job's "find more people"
 * button (POST /api/jobs/[id]/source/crustdata) and its "add" step
 * (POST /api/jobs/[id]/source/pool/add). Lives in lib (the composition layer) because it
 * joins the `pool` and `ats` modules.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Icp } from '@/lib/types/icp'
import { sourceFromIcp, EmptyIcpQueryError, loadAcquiredLevels } from '@/modules/pool/domain/crustdata-acquire'
import { CrustdataConfigError } from '@/modules/pool/vendors/crustdata/client'
import { sourcePoolForIcp, savePoolMatches, embedPoolProfiles, type PoolMatch } from '@/modules/pool/domain/pool-sourcing'
import { resolveSearchSpec, feederEmployersFromSpec, planEveryone } from '@/modules/pool/search/spec-from-brief'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'
import { unlockPoolProfile } from '@/modules/pool/domain/pool-unlock'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import { getPoolAccess } from '@/modules/pool/domain/pool'

export type FindNewResult =
  | { ok: true; creditsUsed: number; fetched: number; matches: PoolMatch[]; unmapped: string[] }
  | { ok: false; reason: string }

export async function findNewCandidates(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  job: { id: string; title: string },
  icp: Icp,
  count: number,
): Promise<FindNewResult> {
  const sb = supabase as never
  // Check talent-pool access BEFORE buying anyone: without it the scoring step returns
  // nothing, and the credits would be spent on people the recruiter never sees.
  const access = await getPoolAccess(sb, orgId)
  if (!access.hasAccess) {
    return { ok: false, reason: "Talent-pool access isn't active for this workspace, so new people can't be scored. Turn it on (or start the trial) in RecruiterStack → Sourcing. No credits were spent." }
  }
  const roleContext = await getJobRoleContext(sb, orgId, job.id)
  let sourced
  try {
    sourced = await sourceFromIcp(sb, icp, { title: job.title, roleContext }, { perPage: count, maxRecords: count, orgId, jobId: job.id })
  } catch (err) {
    if (err instanceof CrustdataConfigError) return { ok: false, reason: 'Market sourcing (Crustdata) is not configured on this RecruiterStack server.' }
    if (err instanceof EmptyIcpQueryError) return { ok: false, reason: "The job's ideal profile has nothing the market search can use. Add a title, employer or school to it in RecruiterStack." }
    if (err instanceof Error && /disabled/i.test(err.message)) return { ok: false, reason: "Market sourcing isn't enabled for this workspace yet." }
    throw err
  }
  await embedPoolProfiles(sb, sourced.ingest.needsReembed).catch(() => {})
  const acquired = { ...(await loadAcquiredLevels(sb, job.id)), ...sourced.acquired }
  const { spec } = resolveSearchSpec(icp, { title: job.title, roleContext })
  const result = await sourcePoolForIcp(sb, orgId, icp, { orgId, userId }, {
    includeIds: Object.keys(acquired), acquired, feederEmployers: feederEmployersFromSpec(spec), plan: planEveryone(spec),
    relaxAtByLabel: Object.fromEntries(icp.must_haves.map((m) => [m.label, m.relax_at ?? null])),
  })
  if (result.status === 'ok') await savePoolMatches(sb, orgId, job.id, icp.version, result.matches).catch(() => {})
  // Only the people bought in THIS run are "new" for the assistant.
  const bought = new Set(sourced.profileIds)
  const matches = result.status === 'ok' ? result.matches.filter((m) => bought.has(m.profile_id)) : []
  return { ok: true, creditsUsed: sourced.creditsUsed, fetched: sourced.fetched, matches, unmapped: (sourced.plan.unmapped ?? []).map((u) => `${u.requirement}: ${u.reason}`) }
}

export type UnlockOutcome = { profile_id: string; candidate_id?: string; status: string }

/** Turn pool profiles (from find_new_candidates_for_job) into org candidates. Stops at the unlock quota. */
export async function unlockProfiles(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  profileIds: string[],
): Promise<{ outcomes: UnlockOutcome[]; quotaExceeded: boolean }> {
  const outcomes: UnlockOutcome[] = []
  for (const profileId of profileIds) {
    const res = await unlockPoolProfile(supabase as never, orgId, profileId, userId, findOrCreateCandidateProfile)
    if (res.status === 'quota_exceeded') return { outcomes, quotaExceeded: true }
    outcomes.push({ profile_id: profileId, status: res.status, candidate_id: 'candidate_id' in res ? (res as { candidate_id?: string }).candidate_id : undefined })
  }
  return { outcomes, quotaExceeded: false }
}
