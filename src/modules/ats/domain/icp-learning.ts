import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/types/database'
import { generateText } from '@/lib/ai/llm'
import { parseAiJson } from '@/lib/ai/parse-ai-response'
import { trackUsage, type UsageIdentity } from '@/lib/ai/track-usage'
import {
  computeWeightSignal,
  detectStructuralGaps,
  type WeightSignal,
  type StructuralDiagnosis,
  type GapRow,
} from '@/lib/ai/weight-learning'
import type { Icp, IcpCompetency } from '@/lib/types/icp'
import { getCurrentIcp, createIcpDraft } from '@/modules/ats/domain/icp'
import { getFeedbackLabels, getFeedbackRows, icpRatesPositive } from '@/modules/ats/domain/scoring-feedback'
import { logger } from '@/lib/logger'

/**
 * The ICP learning engine (Stages 2–3).
 *
 * Turns the frozen decision log into (a) a data-driven reweighting — pooled across
 * SIMILAR jobs so a role with few decisions borrows strength from its family — and
 * (b) a structural diagnosis: when reweighting can't explain the recruiter's calls,
 * propose a whole new competency. It never mutates live scoring; it drafts a new ICP
 * version for a human to approve. Every logged decision feeds it — it reads the whole
 * log each run.
 */

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const SIM_THRESHOLD = 0.75 // only borrow from clearly-similar roles
const BORROW_CAP = 0.6     // a borrowed decision is worth at most this fraction of an own one
const MAX_SIMILAR = 8
const NEW_COMPETENCY_WEIGHT = 15

// ── vector helpers ────────────────────────────────────────────────────────────
function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[]
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : null } catch { return null }
  }
  return null
}
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

export interface SimilarJob { jobId: string; similarity: number }

/** Jobs whose current ICP is semantically similar to this one's (for pooling). */
export async function getSimilarJobs(supabase: Supabase, orgId: string, jobId: string): Promise<SimilarJob[]> {
  const sb = supabase as unknown as LooseSb
  const mine = await getCurrentIcp(supabase, orgId, jobId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myVec = parseVector((mine as any)?.embedding)
  if (!myVec) return []

  const { data } = await sb.from('icps')
    .select('job_id, version, embedding')
    .eq('org_id', orgId)
    .not('embedding', 'is', null)
  // Latest embedded version per OTHER job.
  const latestByJob = new Map<string, { version: number; vec: number[] }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    if (r.job_id === jobId) continue
    const vec = parseVector(r.embedding)
    if (!vec) continue
    const cur = latestByJob.get(r.job_id)
    if (!cur || r.version > cur.version) latestByJob.set(r.job_id, { version: r.version, vec })
  }
  return Array.from(latestByJob.entries())
    .map(([jid, { vec }]) => ({ jobId: jid, similarity: cosine(myVec, vec) }))
    .filter((s) => s.similarity >= SIM_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SIMILAR)
}

/** A borrowed decision's importance: 0 at the threshold, up to BORROW_CAP at sim=1. */
function borrowWeight(similarity: number): number {
  return Math.max(0, (similarity - SIM_THRESHOLD) / (1 - SIM_THRESHOLD)) * BORROW_CAP
}

export interface PooledLabels {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  labels: any[]
  pooled_from: { jobId: string; similarity: number; weight: number; n: number }[]
}

/** This job's decisions (weight 1) + fractionally-weighted decisions from similar jobs. */
export async function getPooledLabels(supabase: Supabase, orgId: string, jobId: string): Promise<PooledLabels> {
  const own = (await getFeedbackLabels(supabase, orgId, jobId)).map((l) => ({ ...l, weight: 1 }))
  const similar = await getSimilarJobs(supabase, orgId, jobId)
  const pooled_from: PooledLabels['pooled_from'] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const borrowed: any[] = []
  for (const s of similar) {
    const w = borrowWeight(s.similarity)
    if (w <= 0) continue
    const labels = await getFeedbackLabels(supabase, orgId, s.jobId)
    if (!labels.length) continue
    borrowed.push(...labels.map((l) => ({ ...l, weight: w })))
    pooled_from.push({ jobId: s.jobId, similarity: s.similarity, weight: w, n: labels.length })
  }
  return { labels: [...own, ...borrowed], pooled_from }
}

export interface LearnedWeights extends WeightSignal {
  icp_version: number | null
  pooled_from: PooledLabels['pooled_from']
}

/** The pooled, data-driven weight suggestion for a job's current ICP. */
export async function learnWeights(supabase: Supabase, orgId: string, jobId: string): Promise<LearnedWeights> {
  const [{ labels, pooled_from }, icp] = await Promise.all([
    getPooledLabels(supabase, orgId, jobId),
    getCurrentIcp(supabase, orgId, jobId),
  ])
  const competencies = (icp?.competencies ?? []).map((c) => ({ id: c.id, name: c.name, weight: c.weight }))
  const signal = computeWeightSignal(labels, competencies)
  return { ...signal, icp_version: icp?.version ?? null, pooled_from }
}

/** Structural disagreement diagnosis for a job (this job's decisions only). */
export async function getStructuralDiagnosis(supabase: Supabase, orgId: string, jobId: string): Promise<StructuralDiagnosis> {
  const rows = await getFeedbackRows(supabase, orgId, jobId)
  const gapRows: GapRow[] = rows.map((r) => ({
    decision: r.decision,
    icp_positive: icpRatesPositive(r.predicted_bucket, r.predicted_score),
    passed_gates: r.passed_gates ?? true,
  }))
  return detectStructuralGaps(gapRows)
}

export interface LearningStatus {
  decided: number
  weights: LearnedWeights
  structural: StructuralDiagnosis
  ready: boolean
  reasons: string[]
}

/** Is there enough signal to propose a refinement, and why? */
export async function getLearningStatus(supabase: Supabase, orgId: string, jobId: string): Promise<LearningStatus> {
  const [weights, structural] = await Promise.all([
    learnWeights(supabase, orgId, jobId),
    getStructuralDiagnosis(supabase, orgId, jobId),
  ])
  const reasons: string[] = []
  if (weights.sufficient) reasons.push('weights can be recalibrated from your decisions')
  if (structural.missing_disqualifier) reasons.push('you keep rejecting candidates the ICP rates highly — a factor is missing')
  if (structural.too_harsh) reasons.push('you keep accepting candidates the ICP rates poorly — it may be too strict')
  return { decided: weights.decided, weights, structural, ready: reasons.length > 0, reasons }
}

// ── Structural: name the missing competency (LLM) ────────────────────────────────
const missingCompetencySchema = z.object({
  name: z.string().min(1).max(120),
  behaviours: z.array(z.string()).default([]),
  anchors: z.object({ '1': z.string(), '2': z.string(), '3': z.string(), '4': z.string() }).optional(),
  rationale: z.string().catch(''),
})

async function proposeMissingCompetency(
  icp: Icp,
  examples: { title: string | null; company: string | null; skills: string[] }[],
  identity: UsageIdentity,
): Promise<IcpCompetency | null> {
  const have = icp.competencies.map((c) => `- ${c.name}`).join('\n')
  const rejected = examples.slice(0, 8)
    .map((e, i) => `${i + 1}. ${e.title ?? 'Unknown'}${e.company ? ` @ ${e.company}` : ''}${e.skills.length ? ` — skills: ${e.skills.slice(0, 8).join(', ')}` : ''}`)
    .join('\n')

  const prompt = `You are a recruiting analyst. An Ideal Candidate Profile scores candidates on these competencies:
${have}

Yet the recruiter has REJECTED the following candidates even though the ICP rated them a strong fit and they passed every hard gate:
${rejected}

This means the recruiter is screening on a real factor the ICP does NOT capture. Infer that ONE missing competency (what do these rejected people have in common that the recruiter dislikes, or lack that the recruiter wants?). Return a competency to ADD.

Respond with ONLY valid JSON (no markdown):
{ "name": "a specific competency name", "behaviours": ["3-5 observable behaviours"], "anchors": { "1":"", "2":"", "3":"", "4":"" }, "rationale": "one sentence on why" }`

  try {
    const { text, usage, model } = await generateText(prompt, { model: 'gemini-2.5-flash', maxTokens: 1024, json: true })
    trackUsage('icp-learning', model, usage, identity)
    const parsed = parseAiJson(text, missingCompetencySchema, 'ICP Learning')
    return {
      id: parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'learned',
      name: parsed.name.trim().slice(0, 120),
      weight: NEW_COMPETENCY_WEIGHT,
      behaviours: (parsed.behaviours ?? []).map((b) => b.trim()).filter(Boolean).slice(0, 6),
      anchors: parsed.anchors,
    }
  } catch (err) {
    logger.warn('ICP Learning: missing-competency proposal failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** Rescale integer weights to sum to exactly 100. PURE. */
function normalize100(weights: number[]): number[] {
  const raw = weights.map((w) => Math.max(0, Number.isFinite(w) ? w : 0))
  const total = raw.reduce((a, b) => a + b, 0) || 1
  const scaled = raw.map((w) => Math.round((w / total) * 100))
  const drift = 100 - scaled.reduce((a, b) => a + b, 0)
  if (scaled.length) {
    const iMax = scaled.reduce((best, w, i) => (w > scaled[best] ? i : best), 0)
    scaled[iMax] = Math.max(0, scaled[iMax] + drift)
  }
  return scaled
}

export interface RefinementProposal {
  status: 'proposed' | 'insufficient'
  icp?: Icp
  change_summary?: string
  weights?: LearnedWeights
  structural?: StructuralDiagnosis
  added_competency?: string | null
}

/**
 * Propose a refined ICP as a NEW DRAFT VERSION, learned from the decision log:
 * recalibrated weights (pooled) + a new competency when the recruiter systematically
 * rejects ICP-loved candidates. Human approves it via the normal approve flow.
 */
export async function proposeRefinement(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  identity: UsageIdentity = {},
): Promise<RefinementProposal> {
  const icp = await getCurrentIcp(supabase, orgId, jobId)
  if (!icp) return { status: 'insufficient' }

  const [weights, structural] = await Promise.all([
    learnWeights(supabase, orgId, jobId),
    getStructuralDiagnosis(supabase, orgId, jobId),
  ])
  if (!weights.sufficient && !structural.missing_disqualifier) {
    return { status: 'insufficient', weights, structural }
  }

  // 1) Apply the learned weights to the existing competencies (by id, else name).
  const suggestedBy = new Map<string, number>()
  weights.competencies.forEach((c) => suggestedBy.set(c.id ?? c.name.toLowerCase(), c.suggested_weight))
  let competencies: IcpCompetency[] = icp.competencies.map((c) => ({
    ...c,
    weight: weights.sufficient ? (suggestedBy.get(c.id) ?? suggestedBy.get(c.name.toLowerCase()) ?? c.weight) : c.weight,
  }))

  // 2) If the recruiter systematically rejects ICP-loved candidates, add a competency.
  let added: string | null = null
  const changes: string[] = []
  if (structural.missing_disqualifier) {
    const rows = await getFeedbackRows(supabase, orgId, jobId)
    const examples = rows
      .filter((r) => r.decision === 'no' && icpRatesPositive(r.predicted_bucket, r.predicted_score) && (r.passed_gates ?? true))
      .map((r) => ({
        title: (r.candidate_features.current_title as string) ?? null,
        company: (r.candidate_features.current_company as string) ?? null,
        skills: (r.candidate_features.skills as string[]) ?? [],
      }))
    const newComp = await proposeMissingCompetency(icp, examples, identity)
    if (newComp) {
      competencies = [...competencies, newComp]
      added = newComp.name
      changes.push(`added "${newComp.name}" (you rejected ${structural.reject_despite_positive} strong-on-paper candidates)`)
    }
  }

  // 3) Re-normalise to 100 and record what moved.
  const normalized = normalize100(competencies.map((c) => c.weight))
  competencies = competencies.map((c, i) => ({ ...c, weight: normalized[i] }))
  if (weights.sufficient) {
    const moved = weights.competencies
      .filter((c) => Math.abs(c.suggested_weight - c.current_weight) >= 3)
      .map((c) => `${c.name} ${c.current_weight}→${c.suggested_weight}`)
    if (moved.length) changes.push(`reweighted: ${moved.join(', ')}`)
  }
  const change_summary = changes.length ? `Learned from ${weights.decided} decisions — ${changes.join('; ')}.` : `Learned from ${weights.decided} decisions.`

  const draft = await createIcpDraft(
    supabase, orgId, jobId,
    { must_haves: icp.must_haves, competencies, source: 'refinement' },
    {
      createdBy: identity.userId ?? null,
      derivedFrom: {
        cause: 'feedback',
        parent_version: icp.version,
        decisions_considered: weights.decided,
        pooled_from: weights.pooled_from.map((p) => ({ job_id: p.jobId, similarity: Number(p.similarity.toFixed(3)) })),
        added_competency: added,
      },
    },
  )

  return { status: 'proposed', icp: draft, change_summary, weights, structural, added_competency: added }
}
