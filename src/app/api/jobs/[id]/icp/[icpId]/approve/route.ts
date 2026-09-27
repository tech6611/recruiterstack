import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { approveIcp, canonicalLocationText, syncActiveIcpLocationsFromJob } from '@/modules/ats/domain/icp'
import { updateCanonicalJob } from '@/modules/ats/domain/job-pipelines'
import { icpToScoringCriteria } from '@/lib/scoring'
import { findOrCreateLocation, syncJobLocationIntakeMirror } from '@/lib/jobs/inherit'
import type { Icp } from '@/lib/types/icp'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** The job's location is authoritative for scoring. The ideal profile's location is
 *  edited on the Scoring tab, so approving an ICP whose location changed moves the job
 *  with it (this used to happen when the Source tab's search plan was saved). */
async function syncJobLocationFromIcp(supabase: unknown, orgId: string, jobId: string, icp: Icp): Promise<void> {
  const loc = (icp.must_haves ?? []).find((g) => g.kind === 'location' && !g.exclude)
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

/** POST — promote a draft ICP to the live version, then sync the down-projected
 *  rubric back to the job so the board + Sifter read the approved ICP. */
export const POST = withCapability(
  'recruiting:edit',
  async (_req, orgId, supabase, { params }, _scope, userId) => {
    try {
      const icp = await approveIcp(supabase, orgId, params.icpId, userId)
      // Keep jobs.custom_fields.scoring_criteria in sync (shallow-merged) so every
      // existing reader of the flat rubric sees the approved ICP unchanged.
      await updateCanonicalJob(supabase, orgId, params.id, {
        custom_fields: { scoring_criteria: icpToScoringCriteria(icp) },
      })
      await syncJobLocationFromIcp(supabase, orgId, params.id, icp)
      return NextResponse.json({ data: icp })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
