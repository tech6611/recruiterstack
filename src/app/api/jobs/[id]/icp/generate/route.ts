import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { generateIcp } from '@/lib/ai/icp-generator'
import { createIcpDraft } from '@/modules/ats/domain/icp'

/** POST — generate a draft ICP for this job. Seeds from the job's existing fields
 *  (rubric, location, level), then enriches with Gemini (behaviours, anchors,
 *  gates) — falling back to the deterministic seed on any AI failure. The
 *  recruiter reviews, edits, and approves the draft. */
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
      const draft = await generateIcp(context.job, { orgId, userId })
      const icp = await createIcpDraft(supabase, orgId, params.id, draft, { createdBy: userId })
      return NextResponse.json({ data: icp }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
