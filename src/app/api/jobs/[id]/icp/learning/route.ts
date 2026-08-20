import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getLearningStatus } from '@/modules/ats/domain/icp-learning'

/** GET — what this job's ICP is learning from the recruiter's decisions: the pooled
 *  data-driven weight suggestion (borrowing from similar jobs), the structural
 *  diagnosis (is a competency missing / is the ICP too strict), and whether there's
 *  enough signal to propose a refinement yet. Read-only + advisory. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    return NextResponse.json({ data: await getLearningStatus(supabase, orgId, params.id) })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
