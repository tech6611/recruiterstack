import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { deriveMovability } from '@/lib/ai/candidate-enrichment'
import type { FeedbackLabel } from '@/lib/ai/icp-feedback'
import { computeWeightSignal, type WeightSignal } from '@/lib/ai/weight-learning'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { logger } from '@/lib/logger'

/**
 * Scoring feedback log (ICP learning loop, Stage 1).
 *
 * When a recruiter decides Yes/No/Maybe, we freeze a POINT-IN-TIME snapshot of what
 * the ICP predicted + what the candidate looked like + the human verdict, into the
 * append-only `scoring_feedback` table (migration 119). The live ai_* columns get
 * overwritten on re-score, so this is the only place the decision-time truth survives.
 *
 * Pure builders are unit-tested; logDecision wraps them with the reads + insert and
 * is strictly best-effort — a logging hiccup must never block a recruiter's action.
 */

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export type Decision = 'yes' | 'no' | 'maybe'
export type FeedbackSource = 'application' | 'sourcing'

export interface CompetencyRating {
  id: string | null
  name: string
  weight: number | null
  rating: number | null
  evidence?: string
}

export interface Prediction {
  icp_id: string | null
  icp_version: number | null
  score: number | null
  bucket: string | null
  recommendation: string | null
  passed_gates: boolean | null
  competency_ratings: CompetencyRating[]
  gate_failures: unknown[]
}

export interface CandidateFeatures {
  current_title: string | null
  current_company: string | null
  experience_years: number | null
  skills: string[]
  location: string | null
  education: unknown[]
  num_roles: number | null
  total_experience_months: number | null
  current_tenure_months: number | null
  avg_tenure_months: number | null
  last_move_months_ago: number | null
}

export interface FeedbackRowInput {
  orgId: string
  jobId: string
  candidateId: string
  applicationId: string | null
  source: FeedbackSource
  decision: Decision
  decidedBy?: string | null
  decisionStage?: string | null
  prediction: Prediction | null
  candidateFeatures: CandidateFeatures
}

/**
 * Attach a stable competency id to each rating by matching its name against the ICP's
 * competencies (the persisted ai_criterion_scores drop the id). PURE + tested.
 */
export function resolveCompetencyIds(
  ratings: { name: string; rating?: number | null; weight?: number | null; evidence?: string }[],
  icpCompetencies: { id: string; name: string; weight?: number }[],
): CompetencyRating[] {
  const byName = new Map(icpCompetencies.map((c) => [c.name.trim().toLowerCase(), c]))
  return (ratings ?? []).map((r) => {
    const match = byName.get((r.name ?? '').trim().toLowerCase())
    return {
      id: match?.id ?? null,
      name: r.name,
      weight: r.weight ?? match?.weight ?? null,
      rating: r.rating ?? null,
      evidence: r.evidence,
    }
  })
}

/** Assemble the immutable snapshot row. PURE + tested. */
export function buildFeedbackRow(input: FeedbackRowInput): Record<string, unknown> {
  const p = input.prediction
  return {
    org_id: input.orgId,
    job_id: input.jobId,
    candidate_id: input.candidateId,
    application_id: input.applicationId,
    source: input.source,
    decision: input.decision,
    decided_by: input.decidedBy ?? null,
    decision_stage: input.decisionStage ?? null,
    icp_id: p?.icp_id ?? null,
    icp_version: p?.icp_version ?? null,
    predicted_score: p?.score ?? null,
    predicted_bucket: p?.bucket ?? null,
    predicted_recommendation: p?.recommendation ?? null,
    passed_gates: p?.passed_gates ?? null,
    competency_ratings: p?.competency_ratings ?? [],
    gate_failures: p?.gate_failures ?? [],
    candidate_features: input.candidateFeatures,
    feature_version: 1,
  }
}

/** Freeze the candidate's structured features + derived movability. */
async function snapshotCandidateFeatures(sb: LooseSb, orgId: string, candidateId: string): Promise<CandidateFeatures> {
  const [{ data: cand }, { data: exps }] = await Promise.all([
    sb.from('candidates').select('current_title, current_company, experience_years, skills, location, education')
      .eq('id', candidateId).eq('org_id', orgId).maybeSingle(),
    sb.from('candidate_experiences').select('title, employer, location, start_date, end_date, is_current, summary')
      .eq('candidate_id', candidateId).eq('org_id', orgId).order('sort_order', { ascending: true }),
  ])
  const mov = deriveMovability((exps ?? []) as never[], new Date())
  return {
    current_title: cand?.current_title ?? null,
    current_company: cand?.current_company ?? null,
    experience_years: cand?.experience_years ?? null,
    skills: cand?.skills ?? [],
    location: cand?.location ?? null,
    education: cand?.education ?? [],
    ...mov,
  }
}

/** The ICP's prediction for an APPLICATION, from the frozen ai_* columns. */
async function predictionFromApplication(sb: LooseSb, orgId: string, applicationId: string): Promise<{ prediction: Prediction; stage: string | null }> {
  const { data: app } = await sb.from('applications')
    .select('ai_icp_id, ai_icp_version, ai_score, ai_fit_bucket, ai_recommendation, ai_criterion_scores, ai_gate_failures, stage_id')
    .eq('id', applicationId).eq('org_id', orgId).maybeSingle()
  const gateFailures = (app?.ai_gate_failures ?? []) as unknown[]
  let ratings: CompetencyRating[] = ((app?.ai_criterion_scores ?? []) as { name: string; rating: number; weight?: number; evidence?: string }[])
    .map((c) => ({ id: null, name: c.name, weight: c.weight ?? null, rating: c.rating ?? null, evidence: c.evidence }))
  if (app?.ai_icp_id) {
    const { data: icp } = await sb.from('icps').select('competencies').eq('id', app.ai_icp_id).eq('org_id', orgId).maybeSingle()
    if (icp?.competencies) ratings = resolveCompetencyIds(ratings, icp.competencies)
  }
  return {
    prediction: {
      icp_id: app?.ai_icp_id ?? null,
      icp_version: app?.ai_icp_version ?? null,
      score: app?.ai_score ?? null,
      bucket: app?.ai_fit_bucket ?? null,
      recommendation: app?.ai_recommendation ?? null,
      passed_gates: gateFailures.length === 0,
      competency_ratings: ratings,
      gate_failures: gateFailures,
    },
    stage: app?.stage_id ?? null,
  }
}

/** The ICP's prediction for a SOURCED candidate, from the cached sourcing_matches row. */
async function predictionFromSourcing(sb: LooseSb, orgId: string, jobId: string, candidateId: string): Promise<Prediction | null> {
  const { data: m } = await sb.from('sourcing_matches')
    .select('score, fit_bucket, recommendation, competencies, gate_failures, icp_id, icp_version')
    .eq('org_id', orgId).eq('job_id', jobId).eq('candidate_id', candidateId).maybeSingle()
  if (!m) return null
  const gateFailures = (m.gate_failures ?? []) as unknown[]
  return {
    icp_id: m.icp_id ?? null,
    icp_version: m.icp_version ?? null,
    score: m.score ?? null,
    bucket: m.fit_bucket ?? null,
    recommendation: m.recommendation ?? null,
    passed_gates: gateFailures.length === 0,
    competency_ratings: ((m.competencies ?? []) as { name: string; rating: number; weight?: number; evidence?: string }[])
      .map((c) => ({ id: null, name: c.name, weight: c.weight ?? null, rating: c.rating ?? null, evidence: c.evidence })),
    gate_failures: gateFailures,
  }
}

/**
 * Log one decision as an immutable training row. Best-effort: any failure is swallowed
 * (logged) so it can never block the recruiter's Yes/No/Maybe action.
 */
export async function logDecision(
  supabase: Supabase,
  orgId: string,
  params: {
    jobId: string
    candidateId: string
    applicationId?: string | null
    source: FeedbackSource
    decision: Decision
    decidedBy?: string | null
  },
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  try {
    const candidateFeatures = await snapshotCandidateFeatures(sb, orgId, params.candidateId)

    let prediction: Prediction | null = null
    let decisionStage: string | null = null
    if (params.source === 'application' && params.applicationId) {
      const r = await predictionFromApplication(sb, orgId, params.applicationId)
      prediction = r.prediction
      decisionStage = r.stage
    } else if (params.source === 'sourcing') {
      prediction = await predictionFromSourcing(sb, orgId, params.jobId, params.candidateId)
      decisionStage = 'sourced'
    }

    const row = buildFeedbackRow({
      orgId,
      jobId: params.jobId,
      candidateId: params.candidateId,
      applicationId: params.applicationId ?? null,
      source: params.source,
      decision: params.decision,
      decidedBy: params.decidedBy,
      decisionStage,
      prediction,
      candidateFeatures,
    })
    await sb.from('scoring_feedback').insert(row)
  } catch (err) {
    logger.warn('scoring_feedback: failed to log decision', {
      error: err instanceof Error ? err.message : String(err),
      candidateId: params.candidateId,
    })
  }
}

// ── Read-side for the refinement loop ────────────────────────────────────────────

/**
 * The recruiter's decisions for a job as FeedbackLabels, read from the frozen log
 * (point-in-time correct, and includes history the live tables may have re-scored
 * away). This is what "Refine ICP from feedback" now consumes.
 */
export async function getFeedbackLabels(supabase: Supabase, orgId: string, jobId: string): Promise<FeedbackLabel[]> {
  const sb = supabase as unknown as LooseSb
  const { data } = await sb.from('scoring_feedback')
    .select('decision, predicted_bucket, predicted_score, competency_ratings, candidate_features')
    .eq('org_id', orgId).eq('job_id', jobId)
    .order('decided_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    decision: r.decision,
    bucket: r.predicted_bucket ?? null,
    score: r.predicted_score ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    competencies: ((r.competency_ratings ?? []) as any[])
      .filter((c) => c.rating != null)
      .map((c) => ({ name: c.name, rating: c.rating as number })),
    title: r.candidate_features?.current_title ?? null,
  }))
}

export interface FeedbackRow {
  decision: Decision
  predicted_bucket: string | null
  predicted_score: number | null
  passed_gates: boolean | null
  competency_ratings: CompetencyRating[]
  candidate_features: Record<string, unknown>
  icp_version: number | null
}

/** Raw log rows for a job (richer than getFeedbackLabels) — used by the learner. */
export async function getFeedbackRows(supabase: Supabase, orgId: string, jobId: string): Promise<FeedbackRow[]> {
  const sb = supabase as unknown as LooseSb
  const { data } = await sb.from('scoring_feedback')
    .select('decision, predicted_bucket, predicted_score, passed_gates, competency_ratings, candidate_features, icp_version')
    .eq('org_id', orgId).eq('job_id', jobId)
    .order('decided_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    decision: r.decision,
    predicted_bucket: r.predicted_bucket ?? null,
    predicted_score: r.predicted_score ?? null,
    passed_gates: r.passed_gates ?? null,
    competency_ratings: (r.competency_ratings ?? []) as CompetencyRating[],
    candidate_features: (r.candidate_features ?? {}) as Record<string, unknown>,
    icp_version: r.icp_version ?? null,
  }))
}

// ── Convergence read-side ────────────────────────────────────────────────────────
// Does each newer ICP version predict the recruiter's decisions better than the last?

export interface VersionAgreement {
  version: number
  decided: number       // yes/no decisions scored by this version (maybe excluded)
  agreement: number | null // 0..1 — share where the ICP's positive/negative call matched the human's
}

/** True if the ICP rated this candidate a fit (great/good, or score >= 60). PURE. */
export function icpRatesPositive(bucket: string | null, score: number | null): boolean {
  if (bucket) return bucket === 'great' || bucket === 'good'
  return score != null && score >= 60
}

/**
 * Per ICP version: how often its Yes/No call agreed with the recruiter's, over the
 * decisions that version actually scored. A rising trend = the ICP is learning the bar.
 */
export async function getIcpConvergence(supabase: Supabase, orgId: string, jobId: string): Promise<VersionAgreement[]> {
  const sb = supabase as unknown as LooseSb
  const { data } = await sb.from('scoring_feedback')
    .select('icp_version, decision, predicted_bucket, predicted_score')
    .eq('org_id', orgId).eq('job_id', jobId)
    .in('decision', ['yes', 'no'])
  const rows = (data ?? []) as { icp_version: number | null; decision: Decision; predicted_bucket: string | null; predicted_score: number | null }[]

  const byVersion = new Map<number, { decided: number; agree: number }>()
  for (const r of rows) {
    if (r.icp_version == null) continue
    const bucket = byVersion.get(r.icp_version) ?? { decided: 0, agree: 0 }
    const positive = icpRatesPositive(r.predicted_bucket, r.predicted_score)
    const matched = positive === (r.decision === 'yes')
    bucket.decided += 1
    if (matched) bucket.agree += 1
    byVersion.set(r.icp_version, bucket)
  }
  return Array.from(byVersion.entries())
    .map(([version, b]) => ({ version, decided: b.decided, agreement: b.decided ? b.agree / b.decided : null }))
    .sort((a, b) => a.version - b.version)
}

// ── Stage 2 (advisory): the weight signal ────────────────────────────────────────

export interface WeightSignalResult extends WeightSignal {
  icp_version: number | null
}

/**
 * The data-driven weight suggestion for a job's current ICP, learned from the frozen
 * decision log. Advisory only — read-only; a human still approves any reweighting.
 */
export async function getWeightSignal(supabase: Supabase, orgId: string, jobId: string): Promise<WeightSignalResult> {
  const [labels, icp] = await Promise.all([
    getFeedbackLabels(supabase, orgId, jobId),
    getCurrentIcp(supabase, orgId, jobId),
  ])
  const competencies = (icp?.competencies ?? []).map((c) => ({ id: c.id, name: c.name, weight: c.weight }))
  const signal = computeWeightSignal(labels, competencies)
  return { ...signal, icp_version: icp?.version ?? null }
}
