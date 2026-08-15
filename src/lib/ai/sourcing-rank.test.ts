import { describe, it, expect } from 'vitest'
import { overlapScore, rankCandidatesForIcp, icpKeywords } from './sourcing-rank'
import type { Candidate } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'

const cand = (o: Record<string, unknown>): Candidate =>
  ({ id: 'c', name: 'X', skills: [], current_title: null, location: null, experience_years: null, ...o } as unknown as Candidate)

const icp = {
  competencies: [
    { id: 'technical', name: 'SQL and Python', weight: 60, behaviours: [] },
    { id: 'domain', name: 'Growth Marketing', weight: 40, behaviours: [] },
  ],
  must_haves: [
    { id: 's', label: 'SQL', attribute: 'skill', operator: 'includes', value: 'SQL' },
    { id: 'l', label: 'Bengaluru', attribute: 'location', operator: 'equals', value: 'Bengaluru' },
    { id: 'e', label: '5+ years', attribute: 'min_experience', operator: 'gte', value: '5' },
  ],
} as Pick<Icp, 'competencies' | 'must_haves'>

describe('icpKeywords', () => {
  it('pulls competency-name words and must-have skill values', () => {
    const kw = icpKeywords(icp)
    expect(kw).toEqual(expect.arrayContaining(['sql', 'python', 'growth', 'marketing']))
  })
})

describe('overlapScore', () => {
  it('rewards keyword overlap between candidate skills/title and the ICP', () => {
    const strong = overlapScore(cand({ skills: ['SQL', 'Python'], current_title: 'Growth Marketing Lead' }), icp)
    const weak = overlapScore(cand({ skills: ['Java'], current_title: 'Backend Engineer' }), icp)
    expect(strong).toBeGreaterThan(weak)
  })

  it('adds a location bonus for a matching must-have location', () => {
    const here = overlapScore(cand({ location: 'Bengaluru, India' }), icp)
    const elsewhere = overlapScore(cand({ location: 'Mumbai' }), icp)
    expect(here).toBe(elsewhere + 2)
  })

  it('adds an experience bonus when the candidate clears the min-experience gate', () => {
    const senior = overlapScore(cand({ experience_years: 7 }), icp)
    const junior = overlapScore(cand({ experience_years: 2 }), icp)
    expect(senior).toBe(junior + 1)
  })
})

describe('rankCandidatesForIcp', () => {
  it('sorts by overlap descending and respects the limit', () => {
    const a = cand({ id: 'a', skills: ['SQL', 'Python'], current_title: 'Growth Marketing' })
    const b = cand({ id: 'b', skills: ['SQL'] })
    const c = cand({ id: 'c', skills: ['Java'] })
    const ranked = rankCandidatesForIcp([c, b, a], icp, 2)
    expect(ranked.map((x) => x.id)).toEqual(['a', 'b'])
  })
})
