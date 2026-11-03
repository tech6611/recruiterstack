import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { generateIcpDraftForJob, JobNotFoundError } from '@/modules/ats/domain/icp-actions'

export const maxDuration = 120 // one deep reasoning-first Gemini pass (reasoning → weights)

/** POST — generate a draft ICP for this job. Seeds from the job's existing fields
 *  (rubric, location, level), then enriches with Gemini (behaviours, anchors,
 *  gates) — falling back to the deterministic seed on any AI failure. The
 *  recruiter reviews, edits, and approves the draft. Logic shared with the
 *  copilot's generate_icp tool (modules/ats/domain/icp-actions). */
export const POST = withCapability(
  'recruiting:edit',
  async (req, orgId, supabase, { params }, _scope, userId) => {
    // Optional intake-call notes/transcript (Component 04) to enrich with verbatim.
    let intakeNotes: string | null = null
    try {
      const body = await req.json()
      if (body && typeof body.intake_notes === 'string') intakeNotes = body.intake_notes.slice(0, 12000)
    } catch {
      /* no body — fine */
    }

    try {
      const icp = await generateIcpDraftForJob(supabase as never, orgId, params.id, userId, intakeNotes)
      return NextResponse.json({ data: icp }, { status: 201 })
    } catch (e) {
      if (e instanceof JobNotFoundError) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
