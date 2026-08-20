/**
 * ICP seed derivation (Slice 1b, LLM-free).
 *
 * Maps a job's EXISTING fields into a draft Ideal Candidate Profile — no model
 * call, so it always works and is fully deterministic. The optional LLM
 * enrichment (anchors, verbatim, gate extraction) arrives as a separate layer in
 * Slice 1c and falls back to this.
 *
 * The job is taken in `HiringRequest` shape (what getCanonicalJobScoringContext
 * returns), so `scoring_criteria`, `location`, `remote_ok`, and `level` are
 * already surfaced uniformly for canonical and legacy jobs.
 */

import { DEFAULT_SCORING_CRITERIA } from '@/lib/scoring'
import type { HiringRequest, ScoringCriterion } from '@/lib/types/database'
import type { IcpCompetency, IcpDraftInput, IcpMustHave } from '@/lib/types/icp'

export function deriveIcpSeed(job: HiringRequest): IcpDraftInput {
  // Competencies seed from the existing weighted rubric, or the standard default
  // if the job has none yet. Behaviours/anchors start empty — the recruiter (or
  // the 1c LLM pass) fills them in.
  const criteria: ScoringCriterion[] =
    job.scoring_criteria && job.scoring_criteria.length > 0
      ? job.scoring_criteria
      : DEFAULT_SCORING_CRITERIA

  const competencies: IcpCompetency[] = criteria.map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    description: c.description ?? undefined,
    behaviours: [],
  }))

  // No hard gates are auto-added from structured fields anymore. A hard gate now
  // REJECTS a candidate, and a good recruiter never rejects on location or a level
  // label alone — those are preferences, not deal-breakers. Deal-breakers are
  // decided by the recruiter-brain LLM from the actual JD (see icp-generator.ts);
  // this seed is the safe LLM-free fallback, and it errs toward gating nobody.
  const must_haves: IcpMustHave[] = []

  return { must_haves, competencies, source: 'seed' }
}
