import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { enrichCandidateById, getCandidateHistory } from '@/modules/ats/domain/candidate-enrichment'

export const maxDuration = 60 // reads the résumé PDF + one Gemini extraction

/** GET — the candidate's structured history + derived movability (for the profile). */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const data = await getCandidateHistory(supabase, orgId, params.id)
    return NextResponse.json({ data })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

/** POST — (re)enrich this candidate from their stored résumé. */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  const result = await enrichCandidateById(supabase, orgId, params.id, { orgId, userId })
  return NextResponse.json({ data: result }, { status: result.status === 'error' ? 502 : 200 })
})
