import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { assembleBrief } from '@/modules/ats/domain/shortlist-brief'

/** GET — the recruiter brief for this job: ICP reasoning + one shortlist ranked across
 *  your own candidates and the market. Assembled from the sourcing caches (no scoring),
 *  so it loads on mount (survives a refresh) and matches the "Source the market" section. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    let roleTitle: string | null = null
    try {
      const ctx = await getCanonicalJobScoringContext(supabase, orgId, params.id)
      roleTitle = ctx?.job?.position_title ?? null
    } catch {
      /* keep null */
    }

    const result = await assembleBrief(supabase, orgId, params.id, roleTitle)
    if (result.status === 'no_icp') {
      return NextResponse.json({ error: 'Approve an ICP for this job to build a shortlist.' }, { status: 400 })
    }
    return NextResponse.json({ data: result.brief })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
