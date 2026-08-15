import type { ScoringCriterion } from '@/lib/types/database'
import type { Icp, IcpCompetency } from '@/lib/types/icp'

// A standard rubric offered as a starting point in the Scoring tab. It is NOT
// auto-applied at scoring time — a job has no rubric until one is explicitly
// saved. Until then candidates are scored holistically (no criterion breakdown).
// Keep in sync with DEFAULT_SCORING_CRITERIA_OBJ in the legacy /jobs board.
export const DEFAULT_SCORING_CRITERIA: ScoringCriterion[] = [
  { id: 'technical',     name: 'Technical Skills',  weight: 35, description: 'Relevant technical expertise and depth' },
  { id: 'experience',    name: 'Domain Experience', weight: 25, description: 'Industry or role-specific background' },
  { id: 'communication', name: 'Communication',     weight: 20, description: 'Clarity, articulation, professional presence' },
  { id: 'culture',       name: 'Culture Fit',       weight: 20, description: 'Alignment with team values and ways of working' },
]

/** The saved scoring rubric on a job's custom_fields, or [] if none is set. */
export function readScoringCriteria(customFields: Record<string, unknown> | null | undefined): ScoringCriterion[] {
  const c = customFields?.scoring_criteria
  return Array.isArray(c) ? (c as ScoringCriterion[]) : []
}

/**
 * Project an ICP's competencies down to the flat ScoringCriterion[] that the
 * current Sifter (job-scorer.ts) and Scoring tab understand. This is what lets
 * the ICP drive scoring with zero changes to the scorer, and is written back to
 * jobs.custom_fields.scoring_criteria whenever an ICP is approved so every
 * existing reader keeps seeing the rubric exactly as before.
 */
export function icpToScoringCriteria(icp: Pick<Icp, 'competencies'>): ScoringCriterion[] {
  return icp.competencies.map((c: IcpCompetency) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    description: c.description ?? '',
  }))
}
