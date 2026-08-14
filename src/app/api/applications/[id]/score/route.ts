import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { scoreApplicationForJob } from '@/lib/ai/job-scorer'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import type { ApplicationUpdate, HiringRequest } from '@/lib/types/database'

// POST /api/applications/[id]/score — (re)score this ONE application and persist
// the result, so the AI Assessment card shows a fresh score. Reuses the same
// scorer + canonical context as the bulk job scorer. Not proxied to Django
// (deeper path than the /api/applications/:id rewrite), so it runs on Next.
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 503 })
  }

  const appId = params.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: app } = await sb
    .from('applications').select('id, job_id').eq('id', appId).eq('org_id', orgId).maybeSingle()
  if (!app?.job_id) {
    return NextResponse.json({ error: 'This application has no job to score against.' }, { status: 400 })
  }

  let context
  try {
    context = await getCanonicalJobScoringContext(supabase, orgId, app.job_id)
  } catch {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (!context) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const target = context.applications.find(a => a.id === appId)
  const candidate = target?.candidate
  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found for this application' }, { status: 404 })
  }

  const result = await scoreApplicationForJob(candidate, context.job as HiringRequest, { orgId, userId })

  const { error } = await supabase
    .from('applications')
    .update({
      ai_score:          result.score,
      ai_recommendation: result.recommendation,
      ai_strengths:      result.strengths,
      ai_gaps:           result.gaps,
      ai_scored_at:      new Date().toISOString(),
    } as unknown as ApplicationUpdate)
    .eq('id', appId)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // criterion_scores may be absent on older DBs — best-effort separate write.
  if (result.criterion_scores) {
    await supabase
      .from('applications')
      .update({ ai_criterion_scores: result.criterion_scores } as unknown as ApplicationUpdate)
      .eq('id', appId)
      .eq('org_id', orgId)
  }

  return NextResponse.json({
    data: { score: result.score, recommendation: result.recommendation },
  })
})
