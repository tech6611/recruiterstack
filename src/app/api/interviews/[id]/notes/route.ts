import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { extractInterviewNotes, type Competency } from '@/lib/ai/notetaker'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export const maxDuration = 120 // transcripts can be long — one Gemini pass

/** Resolve the ICP competencies for an interview (via its application → job). */
async function competenciesForInterview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  applicationId: string | null,
): Promise<Competency[]> {
  if (!applicationId) return []
  const { data: app } = await (supabase as LooseSb)
    .from('applications').select('job_id').eq('id', applicationId).eq('org_id', orgId).maybeSingle()
  if (!app?.job_id) return []
  const icp = await getCurrentIcp(supabase, orgId, app.job_id).catch(() => null)
  return (icp?.competencies ?? []).map((c) => ({ id: c.id, name: c.name }))
}

const bodySchema = z.object({ transcript: z.string().min(1).max(60000) })

/** POST — extract structured notes + a summary from an interview transcript
 *  (Component 10) and store them on the interview. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body

  const { data: interview } = await (supabase as unknown as LooseSb)
    .from('interviews').select('id, application_id').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

  try {
    const competencies = await competenciesForInterview(supabase, orgId, interview.application_id)
    const notes = await extractInterviewNotes(body.transcript, competencies, { orgId, userId })
    const { error } = await (supabase as unknown as LooseSb)
      .from('interviews')
      .update({
        transcript: body.transcript,
        ai_summary: notes.summary,
        ai_notes: notes,
        ai_notes_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('org_id', orgId)
    if (error) return handleSupabaseError(error)
    return NextResponse.json({ data: notes })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

/** GET — the stored notes/transcript for this interview. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data } = await (supabase as unknown as LooseSb)
    .from('interviews')
    .select('transcript, ai_summary, ai_notes, ai_notes_at')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  return NextResponse.json({ data: data ?? null })
})
