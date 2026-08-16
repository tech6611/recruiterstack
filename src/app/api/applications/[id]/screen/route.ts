import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { generateScreeningQuestions } from '@/lib/ai/screening'
import { createScreeningSession, getLatestScreeningForApplication } from '@/modules/ats/domain/ai-screening'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export const maxDuration = 60 // one Gemini question-generation call

/** GET — the latest AI screen for this application (if any). */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const session = await getLatestScreeningForApplication(supabase, orgId, params.id)
  return NextResponse.json({ data: session })
})

/** POST — start an AI screen: generate ICP-targeted questions and mint a candidate
 *  link. Requires an approved ICP on the job. The recruiter shares the link; the
 *  candidate answers async at /screen/[token]. */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  const appId = params.id
  const { data: app } = await (supabase as unknown as LooseSb)
    .from('applications')
    .select('id, job_id, candidate_id')
    .eq('id', appId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!app?.job_id) {
    return NextResponse.json({ error: 'This application has no job to screen against.' }, { status: 400 })
  }

  const icp = await getCurrentIcp(supabase, orgId, app.job_id).catch(() => null)
  if (!icp || icp.status !== 'approved') {
    return NextResponse.json(
      { error: 'This job needs an approved ICP before you can run an AI screen.' },
      { status: 400 },
    )
  }

  let roleTitle = 'this role'
  try {
    const ctx = await getCanonicalJobScoringContext(supabase, orgId, app.job_id)
    roleTitle = ctx?.job?.position_title ?? roleTitle
  } catch {
    /* keep default */
  }

  try {
    const questions = await generateScreeningQuestions(icp, roleTitle, { orgId, userId })
    const session = await createScreeningSession(supabase, orgId, {
      jobId: app.job_id,
      applicationId: appId,
      candidateId: app.candidate_id ?? null,
      icpVersion: icp.version,
      questions,
      createdBy: userId,
    })
    return NextResponse.json({ data: { token: session.token, path: `/screen/${session.token}`, questions } }, { status: 201 })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
