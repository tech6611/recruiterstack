import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { proposeRefinement } from '@/modules/ats/domain/icp-learning'

export const maxDuration = 60 // may make one Gemini call to name a missing competency

/** POST — learn from the decision log and propose a refined ICP as a new DRAFT
 *  version (recalibrated weights + a new competency if the recruiter systematically
 *  rejects ICP-loved candidates). The draft is reviewed & approved like any other —
 *  live scoring never changes without a human. Returns {status:'insufficient'} when
 *  there aren't enough decisions yet. */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  try {
    const result = await proposeRefinement(supabase, orgId, params.id, { orgId, userId })
    return NextResponse.json({ data: result }, { status: result.status === 'proposed' ? 201 : 200 })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
