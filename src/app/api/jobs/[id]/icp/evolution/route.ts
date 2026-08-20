import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getIcpEvolution } from '@/modules/ats/domain/icp'
import { getIcpConvergence } from '@/modules/ats/domain/scoring-feedback'

/** GET — how this job's ICP has evolved over its versions (weight/gate/competency
 *  diffs + why each version exists), plus the convergence signal: did each newer
 *  version predict the recruiter's Yes/No decisions better than the last. Read-only. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const [timeline, convergence] = await Promise.all([
      getIcpEvolution(supabase, orgId, params.id),
      getIcpConvergence(supabase, orgId, params.id).catch(() => []),
    ])
    return NextResponse.json({ data: { timeline, convergence } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
