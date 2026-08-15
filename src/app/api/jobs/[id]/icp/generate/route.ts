import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { deriveIcpSeed } from '@/lib/ai/icp-seed'
import { createIcpDraft } from '@/modules/ats/domain/icp'

/** POST — generate a draft ICP for this job by seeding from its existing fields
 *  (rubric, location, level). LLM-free in Slice 1b; the recruiter reviews, edits,
 *  and approves the draft. */
export const POST = withCapability(
  'recruiting:edit',
  async (_req, orgId, supabase, { params }, _scope, userId) => {
    let context
    try {
      context = await getCanonicalJobScoringContext(supabase, orgId, params.id)
    } catch {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (!context) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    try {
      const seed = deriveIcpSeed(context.job)
      const icp = await createIcpDraft(supabase, orgId, params.id, seed, { createdBy: userId })
      return NextResponse.json({ data: icp }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
