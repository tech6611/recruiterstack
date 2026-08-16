import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { draftScorecardFromTranscript, type Competency } from '@/lib/ai/notetaker'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export const maxDuration = 60

/** POST — draft a scorecard (objective ratings) from this interview's stored
 *  transcript, against the job's ICP competencies (Component 11). The interviewer
 *  reviews + saves it via the normal scorecard flow. */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  const { data: interview } = await (supabase as unknown as LooseSb)
    .from('interviews')
    .select('id, application_id, transcript')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
  if (!interview.transcript) {
    return NextResponse.json({ error: 'Add a transcript and generate notes first.' }, { status: 400 })
  }

  let competencies: Competency[] = []
  if (interview.application_id) {
    const { data: app } = await (supabase as unknown as LooseSb)
      .from('applications').select('job_id').eq('id', interview.application_id).eq('org_id', orgId).maybeSingle()
    if (app?.job_id) {
      const icp = await getCurrentIcp(supabase, orgId, app.job_id).catch(() => null)
      competencies = (icp?.competencies ?? []).map((c) => ({ id: c.id, name: c.name }))
    }
  }

  try {
    const draft = await draftScorecardFromTranscript(interview.transcript, competencies, { orgId, userId })
    return NextResponse.json({ data: draft })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
