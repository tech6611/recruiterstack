import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, Database } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'
import type { UsageIdentity } from '@/lib/ai/track-usage'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { listCandidatesForOrg } from '@/modules/ats/domain/candidates'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { getCandidatesHistory } from '@/modules/ats/domain/candidate-enrichment'
import { rankCandidatesForIcp } from '@/lib/ai/sourcing-rank'
import { icpEmbeddingText } from '@/lib/ai/embeddings'
import { embedText } from '@/lib/ai/llm'
import { scoreAgainstIcp } from '@/lib/ai/fit-engine'

type Supabase = SupabaseClient<Database>
// `sourcing_matches` (migration 106) isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const SHORTLIST = 20 // how many candidates the Fit Engine judges per run
const CONCURRENCY = 5 // Fit-Engine calls in flight at once

export interface SourcingMatch {
  id: string
  candidate_id: string
  score: number
  fit_bucket: string | null
  recommendation: string | null
  gate_failures: { label?: string }[]
  red_flags: string[]
  rationale: string | null
  competencies: { name: string; rating: number; evidence?: string }[]
  icp_version: number | null
  decision: string | null
  updated_at: string
  candidate?: {
    id: string
    name: string | null
    current_title: string | null
    location: string | null
    skills: string[] | null
    linkedin_url: string | null
  } | null
}

export type RunSourcingResult =
  | { status: 'no_icp' }
  | { status: 'sourced'; shortlisted: number; scored: number; icp_version: number }

/** The cached matches for a job, newest/highest first, with basic candidate info. */
export async function getSourcingMatches(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<SourcingMatch[]> {
  const sb = supabase as unknown as LooseSb
  const { data, error } = await sb
    .from('sourcing_matches')
    .select('*, candidate:candidates(id, name, current_title, location, skills, linkedin_url)')
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .order('score', { ascending: false })
  if (error) throw error
  return (data ?? []) as SourcingMatch[]
}

/** Record the recruiter's yes/no/maybe on a sourced match (calibration, 5b). */
export async function setSourcingDecision(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  candidateId: string,
  decision: 'yes' | 'no' | 'maybe' | null,
  decidedBy?: string | null,
): Promise<void> {
  const sb = supabase as unknown as LooseSb
  const { error } = await sb
    .from('sourcing_matches')
    .update({
      decision,
      decided_at: decision ? new Date().toISOString() : null,
      decided_by: decision ? (decidedBy ?? null) : null,
    })
    .eq('org_id', orgId)
    .eq('job_id', jobId)
    .eq('candidate_id', candidateId)
  if (error) throw error
}

/**
 * Shortlist the pool for the ICP. Prefers semantic recall (5c) — embed the ICP,
 * find nearest candidates via pgvector — and falls back to keyword overlap (5a)
 * when embeddings aren't populated, pgvector is unavailable, or the query errors.
 */
async function shortlistForIcp(
  supabase: Supabase,
  orgId: string,
  icp: Icp,
  candidates: Candidate[],
  inPipeline: Set<string>,
): Promise<Candidate[]> {
  try {
    const query = await embedText(icpEmbeddingText(icp))
    const sb = supabase as unknown as LooseSb
    const { data, error } = await sb.rpc('match_candidates', {
      query_embedding: query,
      match_org: orgId,
      match_count: SHORTLIST,
      exclude_ids: Array.from(inPipeline),
    })
    if (!error && Array.isArray(data) && data.length > 0) {
      const byId = new Map(candidates.map((c) => [c.id, c]))
      const matched = data.map((r: { id: string }) => byId.get(r.id)).filter(Boolean) as Candidate[]
      if (matched.length > 0) return matched
    }
  } catch {
    /* fall through to keyword overlap */
  }
  return rankCandidatesForIcp(candidates, icp, SHORTLIST)
}

/**
 * Source from the org's own candidate pool against the job's approved ICP:
 * shortlist (semantic recall, or keyword overlap), Fit-Engine the shortlist, and
 * upsert into the cache. Skips candidates already in this job's pipeline.
 */
export async function runSourcing(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  identity: UsageIdentity = {},
): Promise<RunSourcingResult> {
  const icp = await getCurrentIcp(supabase, orgId, jobId)
  if (!icp || icp.status !== 'approved') return { status: 'no_icp' }

  const [pool, context] = await Promise.all([
    listCandidatesForOrg(supabase, orgId),
    getCanonicalJobScoringContext(supabase, orgId, jobId).catch(() => null),
  ])
  const inPipeline = new Set(
    (context?.applications ?? []).map((a) => a.candidate?.id).filter(Boolean),
  )
  const candidates = pool.filter((c) => !inPipeline.has(c.id))
  const shortlist = await shortlistForIcp(supabase, orgId, icp, candidates, inPipeline)

  // Education + work history for the shortlist, so background deal-breakers ("is this a
  // genuine engineer?") are judged on real evidence, not the current title alone.
  const histories = await getCandidatesHistory(supabase, orgId, shortlist.map((c) => c.id))

  const sb = supabase as unknown as LooseSb
  let scored = 0
  for (let i = 0; i < shortlist.length; i += CONCURRENCY) {
    const chunk = shortlist.slice(i, i + CONCURRENCY)
    const fits = await Promise.all(
      chunk.map((c) =>
        scoreAgainstIcp(c, icp, identity, undefined, histories.get(c.id))
          .then((f) => ({ candidateId: c.id, fit: f }))
          .catch(() => null),
      ),
    )
    for (const r of fits) {
      if (!r) continue
      const { error } = await sb.from('sourcing_matches').upsert(
        {
          org_id: orgId,
          job_id: jobId,
          candidate_id: r.candidateId,
          score: r.fit.score,
          fit_bucket: r.fit.fit_bucket,
          recommendation: r.fit.recommendation,
          gate_failures: r.fit.gate_failures,
          red_flags: r.fit.red_flags,
          rationale: r.fit.rationale,
          competencies: r.fit.competencies.map((c) => ({ name: c.name, rating: c.rating, evidence: c.evidence })),
          icp_id: icp.id,
          icp_version: icp.version,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'job_id,candidate_id' },
      )
      if (!error) scored++
    }
  }

  return { status: 'sourced', shortlisted: shortlist.length, scored, icp_version: icp.version }
}
