/**
 * Generate / approve a job's Ideal Candidate Profile — the single implementation
 * behind the Scoring tab (POST /api/jobs/:id/icp/generate and
 * /api/jobs/:id/icp/:icpId/approve) and the copilot's generate_icp / approve_icp
 * tools.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCanonicalJobScoringContext, updateCanonicalJob } from '@/modules/ats/domain/job-pipelines'
import { generateIcpWithReasoning } from '@/lib/ai/icp-generator'
import { approveIcp, canonicalLocationText, createIcpDraft, getLatestIcp, syncActiveIcpLocationsFromJob } from '@/modules/ats/domain/icp'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'
import { icpToScoringCriteria } from '@/lib/scoring'
import { findOrCreateLocation, syncJobLocationIntakeMirror } from '@/lib/jobs/inherit'
import { jobWideMustHaves } from '@/lib/icp-gates'
import { logger } from '@/lib/logger'
import type { Icp } from '@/lib/types/icp'

// icps.sourcing_map (migration 116) isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export class JobNotFoundError extends Error {
  constructor() { super('Job not found') }
}

/** Generate a new draft ICP for the job with one reasoning-first Gemini pass
 *  (falls back to a deterministic seed on AI failure). Keeps the recruiter's
 *  past corrections. Throws JobNotFoundError if the job isn't in the org. */
export async function generateIcpDraftForJob(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
  userId: string | null,
  intakeNotes: string | null,
): Promise<Icp & { sourcing_map: unknown }> {
  let context
  try {
    context = await getCanonicalJobScoringContext(supabase as never, orgId, jobId)
  } catch {
    throw new JobNotFoundError()
  }
  if (!context) throw new JobNotFoundError()

  const [roleContext, previous] = await Promise.all([
    getJobRoleContext(supabase as never, orgId, jobId),
    getLatestIcp(supabase as never, orgId, jobId).catch(() => null),
  ])
  const recruiterCorrections = previous?.sourcing_map?.recruiter_brief?.corrections ?? null
  const { draft, sourcingMap } = await generateIcpWithReasoning(
    context.job, { orgId, userId }, intakeNotes, { roleContext, recruiterCorrections },
  )
  // Regenerate starts fresh — never inherit the previous version's reasoning.
  const icp = await createIcpDraft(supabase as never, orgId, jobId, draft, { createdBy: userId ?? undefined, inheritSourcingMap: false })

  // No AI reasoning → still keep the recruiter's corrections (house knowledge).
  const map = sourcingMap ?? (recruiterCorrections
    ? { reasoning: '', requirement_decomposition: [], unwritten_filters: [], recruiter_brief: {
        niche: '', persona: '', feeder_pools: [], title_families: [], market_gates: [], jd_translations: [],
        market_norms: [], normal_red_flags: [], unsure_about: [], corrections: recruiterCorrections } }
    : null)
  if (map) {
    await (supabase as unknown as LooseSb).from('icps').update({ sourcing_map: map }).eq('id', icp.id).eq('org_id', orgId)
  }
  return { ...icp, sourcing_map: map }
}

/** The job's location is authoritative for scoring. Approving an ICP whose
 *  location changed moves the job with it. */
async function syncJobLocationFromIcp(supabase: unknown, orgId: string, jobId: string, icp: Icp): Promise<void> {
  const loc = jobWideMustHaves(icp.must_haves).find((g) => g.kind === 'location' && !g.exclude)
  const market = typeof loc?.values?.[0] === 'string' ? loc.values[0].trim() : ''
  if (!market) return
  const sb = supabase as LooseSb
  const { data: job } = await sb.from('jobs').select('location:locations(name, city, state, country)').eq('id', jobId).eq('org_id', orgId).maybeSingle()
  if ((canonicalLocationText(job?.location) ?? '').toLowerCase() === market.toLowerCase()) return
  const locationId = await findOrCreateLocation(sb, orgId, market)
  if (!locationId) return
  const { error } = await sb.from('jobs').update({ location_id: locationId }).eq('id', jobId).eq('org_id', orgId)
  if (error) throw error
  await syncJobLocationIntakeMirror(sb, orgId, jobId)
  await syncActiveIcpLocationsFromJob(sb, orgId, jobId)
}

/** Promote a draft ICP to the live version and sync the down-projected rubric
 *  (and location) back to the job so the board + scoring read it. */
export async function approveIcpForJob(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
  icpId: string,
  userId: string | null,
): Promise<Icp> {
  const icp = await approveIcp(supabase as never, orgId, icpId, userId)
  await updateCanonicalJob(supabase as never, orgId, jobId, {
    custom_fields: { scoring_criteria: icpToScoringCriteria(icp) },
  })
  // The approval has already committed — a location-sync failure must not report it as failed.
  await syncJobLocationFromIcp(supabase, orgId, jobId, icp).catch((err) =>
    logger.warn('Job location sync after ICP approve failed', { jobId, error: err instanceof Error ? err.message : String(err) }))
  return icp
}
