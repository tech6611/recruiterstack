import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getWeightSignal } from '@/modules/ats/domain/scoring-feedback'

/** GET — the data-driven weight suggestion for this job's ICP, learned from the
 *  recruiter's logged Yes/No decisions. Advisory + read-only: shows, per competency,
 *  how its ratings separated Yes from No and a confidence-shrunk suggested weight.
 *  Returns { sufficient:false } until enough decisions have accumulated. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const signal = await getWeightSignal(supabase, orgId, params.id)
    return NextResponse.json({ data: signal })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
