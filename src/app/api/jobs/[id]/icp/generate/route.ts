import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { generateIcpWithReasoning } from '@/lib/ai/icp-generator'
import { createIcpDraft, getLatestIcp } from '@/modules/ats/domain/icp'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'

export const maxDuration = 120 // one deep reasoning-first Gemini pass (reasoning → weights)

// icps.sourcing_map (migration 116) isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** POST — generate a draft ICP for this job. Seeds from the job's existing fields
 *  (rubric, location, level), then enriches with Gemini (behaviours, anchors,
 *  gates) — falling back to the deterministic seed on any AI failure. The
 *  recruiter reviews, edits, and approves the draft. */
export const POST = withCapability(
  'recruiting:edit',
  async (req, orgId, supabase, { params }, _scope, userId) => {
    let context
    try {
      context = await getCanonicalJobScoringContext(supabase, orgId, params.id)
    } catch {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (!context) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    // Optional intake-call notes/transcript (Component 04) to enrich with verbatim.
    let intakeNotes: string | null = null
    try {
      const body = await req.json()
      if (body && typeof body.intake_notes === 'string') intakeNotes = body.intake_notes.slice(0, 12000)
    } catch {
      /* no body — fine */
    }

    try {
      // One reasoning-first pass: the recruiter's brain reasons about the role, then
      // the weighted competencies + deal-breakers fall out of that reasoning. The same
      // pass produces the sourcing_map (reasoning/decomposition/archetypes).
      // Phase 1 (niche recruiter): the market + company decide WHICH recruiter the
      // model is; the recruiter's corrections on the previous brief are house
      // knowledge that override the model's defaults and survive regeneration.
      const [roleContext, previous] = await Promise.all([
        getJobRoleContext(supabase, orgId, params.id),
        getLatestIcp(supabase, orgId, params.id).catch(() => null),
      ])
      const recruiterCorrections = previous?.sourcing_map?.recruiter_brief?.corrections ?? null
      const { draft, sourcingMap } = await generateIcpWithReasoning(
        context.job, { orgId, userId }, intakeNotes, { roleContext, recruiterCorrections },
      )
      const icp = await createIcpDraft(supabase, orgId, params.id, draft, { createdBy: userId })

      if (sourcingMap) {
        await (supabase as unknown as LooseSb)
          .from('icps').update({ sourcing_map: sourcingMap }).eq('id', icp.id).eq('org_id', orgId)
      }

      return NextResponse.json({ data: { ...icp, sourcing_map: sourcingMap } }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
