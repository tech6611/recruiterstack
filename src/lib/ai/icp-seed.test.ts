import { describe, it, expect } from 'vitest'
import { deriveIcpSeed } from './icp-seed'
import { DEFAULT_SCORING_CRITERIA } from '@/lib/scoring'
import type { HiringRequest } from '@/lib/types/database'

// deriveIcpSeed only reads a handful of fields; build minimal jobs and cast.
function job(overrides: Partial<HiringRequest>): HiringRequest {
  return {
    position_title: 'Backend Engineer',
    location: null,
    remote_ok: false,
    level: null,
    scoring_criteria: null,
    ...overrides,
  } as unknown as HiringRequest
}

describe('deriveIcpSeed', () => {
  it('seeds competencies from the job rubric when present', () => {
    const seed = deriveIcpSeed(
      job({
        scoring_criteria: [
          { id: 'tech', name: 'Technical', weight: 60, description: 'depth' },
          { id: 'comm', name: 'Communication', weight: 40, description: '' },
        ],
      }),
    )
    expect(seed.competencies.map((c) => c.id)).toEqual(['tech', 'comm'])
    expect(seed.competencies[0]).toMatchObject({ name: 'Technical', weight: 60, behaviours: [] })
    expect(seed.source).toBe('seed')
  })

  it('falls back to the default rubric when the job has none', () => {
    const seed = deriveIcpSeed(job({ scoring_criteria: null }))
    expect(seed.competencies.map((c) => c.id)).toEqual(DEFAULT_SCORING_CRITERIA.map((c) => c.id))
    expect(seed.competencies.every((c) => c.behaviours.length === 0)).toBe(true)
  })

  it('never auto-adds a location gate — location is a preference, not a deal-breaker', () => {
    const onsite = deriveIcpSeed(job({ location: 'Bengaluru', remote_ok: false }))
    expect(onsite.must_haves.find((m) => m.attribute === 'location')).toBeUndefined()
  })

  it('never auto-adds a seniority gate from the level field', () => {
    const seed = deriveIcpSeed(job({ level: 'Senior' }))
    expect(seed.must_haves.find((m) => m.attribute === 'seniority')).toBeUndefined()
  })

  it('adds no auto gates at all — the recruiter-brain LLM decides deal-breakers', () => {
    expect(deriveIcpSeed(job({ location: 'Bengaluru', remote_ok: false, level: 'Senior' })).must_haves).toEqual([])
    expect(deriveIcpSeed(job({ location: null, remote_ok: true, level: null })).must_haves).toEqual([])
  })
})
