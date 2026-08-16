import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { diagnoseFailureModes } from '@/modules/ats/domain/learning-signals'

/** GET — what the pipeline is teaching you (Sourcing Brain, Slice 3): the fit /
 *  reachability / movability breakdown, so you fix the right thing. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const data = await diagnoseFailureModes(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
