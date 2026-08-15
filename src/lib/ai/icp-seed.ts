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

  // Hard gates derived from structured fields. Kept deliberately conservative —
  // only unambiguous constraints become gates; everything else stays a weighted
  // competency so nobody is filtered out on a soft signal.
  const must_haves: IcpMustHave[] = []

  if (job.location && !job.remote_ok) {
    must_haves.push({
      id: 'location',
      label: `Based in ${job.location}`,
      attribute: 'location',
      operator: 'equals',
      value: job.location,
    })
  }

  if (job.level) {
    must_haves.push({
      id: 'seniority',
      label: `${job.level} level`,
      attribute: 'seniority',
      operator: 'equals',
      value: job.level,
    })
  }

  return { must_haves, competencies, source: 'seed' }
}
