import { describe, it, expect } from 'vitest'
import { resolveCompetencyIds, buildFeedbackRow, icpRatesPositive, type FeedbackRowInput } from './scoring-feedback'

describe('resolveCompetencyIds', () => {
  const icp = [
    { id: 'leadership', name: 'People Leadership', weight: 40 },
    { id: 'tech', name: 'Technical Execution', weight: 35 },
  ]
  it('attaches the stable id by matching name (case/space-insensitive)', () => {
    const out = resolveCompetencyIds(
      [{ name: 'people leadership', rating: 3 }, { name: 'Technical Execution', rating: 4 }],
      icp,
    )
    expect(out.map((c) => c.id)).toEqual(['leadership', 'tech'])
    expect(out[0]).toMatchObject({ name: 'people leadership', rating: 3, weight: 40 })
  })
  it('leaves id null when no competency matches, and keeps the rating', () => {
    const out = resolveCompetencyIds([{ name: 'Mystery Skill', rating: 2 }], icp)
    expect(out[0]).toMatchObject({ id: null, name: 'Mystery Skill', rating: 2, weight: null })
  })
})

describe('buildFeedbackRow', () => {
  const base: FeedbackRowInput = {
    orgId: 'org1', jobId: 'job1', candidateId: 'cand1', applicationId: 'app1',
    source: 'application', decision: 'no', decidedBy: 'user1', decisionStage: 'screen',
    prediction: {
      icp_id: 'icp1', icp_version: 3, score: 82, bucket: 'great', recommendation: 'strong_yes',
      passed_gates: true, competency_ratings: [{ id: 'x', name: 'X', weight: 100, rating: 4 }], gate_failures: [],
    },
    candidateFeatures: {
      current_title: 'PM', current_company: 'Acme', experience_years: 9, skills: ['a'], location: 'BLR',
      education: [], num_roles: 3, total_experience_months: 108, current_tenure_months: 20,
      avg_tenure_months: 36, last_move_months_ago: 20,
    },
  }
  it('captures the disagreement case (recruiter No, ICP predicted great)', () => {
    const row = buildFeedbackRow(base)
    expect(row).toMatchObject({
      org_id: 'org1', job_id: 'job1', candidate_id: 'cand1', application_id: 'app1',
      source: 'application', decision: 'no', predicted_bucket: 'great', predicted_score: 82,
      icp_version: 3, passed_gates: true, feature_version: 1,
    })
  })
  it('tolerates a missing prediction (decided before scoring)', () => {
    const row = buildFeedbackRow({ ...base, prediction: null })
    expect(row).toMatchObject({ predicted_score: null, predicted_bucket: null, icp_id: null, competency_ratings: [] })
  })
})

describe('icpRatesPositive', () => {
  it('uses the bucket first (great/good = positive)', () => {
    expect(icpRatesPositive('great', 0)).toBe(true)
    expect(icpRatesPositive('good', 0)).toBe(true)
    expect(icpRatesPositive('okay', 99)).toBe(false)
    expect(icpRatesPositive('weak', 99)).toBe(false)
  })
  it('falls back to score >= 60 when no bucket', () => {
    expect(icpRatesPositive(null, 60)).toBe(true)
    expect(icpRatesPositive(null, 59)).toBe(false)
    expect(icpRatesPositive(null, null)).toBe(false)
  })
})
