import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { scoreApplicationForJob } from '@/lib/ai/job-scorer'
import { scoreAgainstIcp } from '@/lib/ai/fit-engine'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { getCandidatesHistory } from '@/modules/ats/domain/candidate-enrichment'
import type { Icp } from '@/lib/types/icp'
import type { ApplicationUpdate, HiringRequest } from '@/lib/types/database'

// POST /api/applications/[id]/score — (re)score this ONE application and persist
// the result, so the AI Assessment card shows a fresh score. When the job has an
// approved ICP it uses the Fit Engine (gates + ICP-anchored judging + evidence),
// matching the bulk /api/jobs/[id]/score path; otherwise the flat-rubric scorer.
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

  // Fit Engine when the job has an approved ICP; else the flat-rubric scorer.
  // Resilient: a missing ICP table (migrations not yet applied) → flat scoring.
  let icp: Icp | null = null
  try {
    icp = await getCurrentIcp(supabase, orgId, app.job_id)
  } catch {
    icp = null
  }
  const update: Record<string, unknown> = { ai_scored_at: new Date().toISOString() }
  let criterionScores: unknown[] | undefined
  let respExtra: Record<string, unknown> = {}

  if (icp && icp.status === 'approved') {
    const histories = await getCandidatesHistory(supabase, orgId, [candidate.id])
    // Applicant: FLAG missing background data (don't reject); the recruiter decides.
    const fit = await scoreAgainstIcp(candidate, icp, { orgId, userId }, undefined, histories.get(candidate.id), 'flag')
    update.ai_score          = fit.score
    update.ai_recommendation = fit.recommendation
    update.ai_strengths      = fit.strengths
    update.ai_gaps           = fit.gaps
    update.ai_red_flags      = fit.red_flags
    update.ai_rationale      = fit.rationale
    update.ai_fit_bucket     = fit.fit_bucket
    update.ai_gate_failures  = fit.gate_failures
    update.knockout_failed   = !fit.passed_gates
    update.ai_data_incomplete = fit.data_incomplete
    update.ai_icp_id         = icp.id
    update.ai_icp_version    = icp.version
    criterionScores = fit.competencies.map(c => ({ name: c.name, rating: c.rating, weight: c.weight, evidence: c.evidence }))
    respExtra = { fit_bucket: fit.fit_bucket, red_flags: fit.red_flags, gate_failures: fit.gate_failures.map(g => g.label) }
  } else {
    const result = await scoreApplicationForJob(candidate, context.job as HiringRequest, { orgId, userId })
    update.ai_score          = result.score
    update.ai_recommendation = result.recommendation
    update.ai_strengths      = result.strengths
    update.ai_gaps           = result.gaps
    criterionScores = result.criterion_scores
  }

  const { error } = await supabase
    .from('applications')
    .update(update as unknown as ApplicationUpdate)
    .eq('id', appId)
    .eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // criterion_scores may be absent on older DBs — best-effort separate write.
  if (criterionScores) {
    await supabase
      .from('applications')
      .update({ ai_criterion_scores: criterionScores } as unknown as ApplicationUpdate)
      .eq('id', appId)
      .eq('org_id', orgId)
  }

  return NextResponse.json({
    data: { score: update.ai_score, recommendation: update.ai_recommendation, ...respExtra },
  })
})
