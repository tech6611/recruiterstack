import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { assembleBrief } from '@/modules/ats/domain/shortlist-brief'

export const maxDuration = 300 // may score the market on demand

/** POST — the recruiter brief for this job: ICP reasoning + one shortlist ranked
 *  across your own candidates and the market (Sourcing Brain, Slice 1b). */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  try {
    let roleTitle: string | null = null
    try {
      const ctx = await getCanonicalJobScoringContext(supabase, orgId, params.id)
      roleTitle = ctx?.job?.position_title ?? null
    } catch {
      /* keep null */
    }

    const result = await assembleBrief(supabase, orgId, params.id, roleTitle, { orgId, userId })
    if (result.status === 'no_icp') {
      return NextResponse.json({ error: 'Approve an ICP for this job to build a shortlist.' }, { status: 400 })
    }
    return NextResponse.json({ data: result.brief })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
