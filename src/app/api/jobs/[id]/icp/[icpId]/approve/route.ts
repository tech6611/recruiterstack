import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { approveIcp } from '@/modules/ats/domain/icp'
import { updateCanonicalJob } from '@/modules/ats/domain/job-pipelines'
import { icpToScoringCriteria } from '@/lib/scoring'

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
      return NextResponse.json({ data: icp })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
