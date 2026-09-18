import { describe, it, expect } from 'vitest'
import { specFromIcp, employerTerms } from './spec-from-brief'
import type { Icp } from '@/lib/types/icp'

const brief = {
  niche: 'Strategy & Ops recruiter, Bengaluru', persona: 'p', market: 'Bengaluru',
  experience_band: { min_years: 2, max_years: 6, rationale: 'IC seat' },
  target_schools: null,
  feeder_pools: [
    { label: 'High-Growth Startup BizOps', companies: ['Razorpay, CRED', 'Google (Strategy/BizOps teams)'], role_types: ['Strategy Manager', "Chief of Staff's Office"], priority: 2 },
    { label: 'Top-Tier Management Consulting', companies: ['McKinsey & Company', 'Boston Consulting Group (BCG)'], role_types: ['Business Analyst, Associate'], priority: 1 },
    { label: 'Investment Banking / VC', companies: ['Goldman Sachs', 'Sequoia Capital'], role_types: ['Analyst'], priority: 3 },
  ],
  title_families: ['BizOps Manager', 'Chief of Staff'],
  market_gates: [{ requirement: 'Degree from a top university', why: 'tier-1 pedigree is the first-pass filter' }],
  jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [],
}
const icp = {
  must_haves: [
    { id: 'g0', label: 'Is the core background in consulting, IB/VC/PE, or BizOps?', attribute: '', operator: '', value: '' },
    { id: 'g1', label: 'Is the candidate a graduate of a Tier-1 university?', attribute: '', operator: '', value: '' },
    { id: 'g2', label: 'Does the profile explicitly mention SQL?', attribute: '', operator: '', value: '' },
    { id: 'g-band', label: 'Has between 2 and 6 years…', attribute: 'experience_band', operator: 'between', value: ['2', '6'] },
  ],
  competencies: [{ id: 'sps', name: 'Structured Problem-Solving', weight: 100, behaviours: [] }],
  sourcing_map: { reasoning: '', requirement_decomposition: [], unwritten_filters: [], recruiter_brief: brief },
} as unknown as Pick<Icp, 'must_haves' | 'sourcing_map' | 'competencies'>
const ctx = { title: 'Strategy & Operations Manager', roleContext: { market: { site: 'HQ', city: 'Bengaluru', state: 'Karnataka', country: 'IN', timezone: 'IST', work_model: 'onsite' }, company: null } }

describe('employerTerms', () => {
  it('keeps short parenthetical aliases and drops descriptive ones', () => {
    expect(employerTerms('Boston Consulting Group (BCG)')).toEqual(['Boston Consulting Group', 'BCG'])
    expect(employerTerms('Google (Strategy/BizOps teams)')).toEqual(['Google'])
    expect(employerTerms('McKinsey & Company')).toEqual(['McKinsey'])
    expect(employerTerms('Razorpay, CRED')).toEqual(['Razorpay', 'CRED'])
  })
})

describe('specFromIcp', () => {
  const spec = specFromIcp(icp, ctx)

  it('builds the must-have line: market radius, years band, and an IC seniority ceiling', () => {
    expect(spec.base.map((c) => c.kind)).toEqual(['location', 'years_band', 'seniority'])
    expect(spec.base[0]).toMatchObject({ values: ['Bengaluru, Karnataka, India'], radius_km: 50 })
    expect(spec.base[1]).toMatchObject({ min: 2, max: 6 })
    expect(spec.base[2]).toMatchObject({ exclude: true, values: ['Director', 'Vice President', 'CXO', 'Owner / Partner'] })
  })

  it('orders levels: tier-1 × consulting (current, then past) → tier-1 × operators → tier-1 × finance → tier-2 → titles', () => {
    expect(spec.levels.map((l) => l.label)).toEqual([
      'Tier-1 school · currently in Top-Tier Management Consulting',
      'Tier-1 school · formerly in Top-Tier Management Consulting',
      'Tier-1 school · currently in High-Growth Startup BizOps',
      'Tier-1 school · Investment Banking / VC',
      'Tier-2 school · currently in Top-Tier Management Consulting',
      'Tier-2 school · formerly in Top-Tier Management Consulting',
      'Tier-2 school · currently in High-Growth Startup BizOps',
      'Tier-2 school · Investment Banking / VC',
      'Any school · title families',
    ])
    expect(spec.levels[4].relaxes).toBe('tier-1 schools → tier-2 schools')
    expect(spec.levels[8].relaxes).toContain('title only')
  })

  it('level 1 is the 100% match: house tier-1 list × currently at MBB × analyst/associate titles', () => {
    const l1 = spec.levels[0]
    expect(l1.criteria.map((c) => c.kind)).toEqual(['school', 'employer_current', 'function', 'title_any'])
    expect(l1.criteria[0].values).toContain('Indian Institute of Technology')
    expect(l1.criteria[1].values).toEqual(['McKinsey', 'Boston Consulting Group', 'BCG'])
    expect(l1.criteria[2].values).toEqual(['Consulting'])
    expect(l1.criteria[3].values).toEqual(['Business Analyst', 'Associate'])
  })

  it('brief-supplied school lists override the house lists', () => {
    const own = specFromIcp({ ...icp, sourcing_map: { ...icp.sourcing_map!, recruiter_brief: { ...brief, target_schools: { tier1: ['IIM Ahmedabad'], tier2: [] } } } }, ctx)
    expect(own.levels[0].criteria[0].values).toEqual(['IIM Ahmedabad'])
    expect(own.levels.some((l) => l.label.startsWith('Tier-2'))).toBe(false)
  })

  it('lists what no source can search: SQL (judge, with the proxy note), consulting tenure (local), competencies (judge)', () => {
    expect(spec.post_fetch.map((p) => `${p.how}:${p.label}`)).toEqual([
      'judge:Does the profile explicitly mention SQL?',
      'local:Meaningful time in consulting (≥ 18 months), and how recently they left',
      'judge:Structured Problem-Solving',
    ])
    expect(spec.post_fetch[0].note).toContain('proxy')
  })

  it('without a brief falls back to a single title level and no school tiers', () => {
    const bare = specFromIcp({ must_haves: [], competencies: [] }, { title: 'Ops Manager' })
    expect(bare.levels.map((l) => l.label)).toEqual(['Any school · title families'])
    expect(bare.base).toEqual([])
  })
})
