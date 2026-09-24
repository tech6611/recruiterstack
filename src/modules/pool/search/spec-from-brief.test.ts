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

// ── The ideal profile → ladder (docs/ideal-profile-plan.md) ──────────────────────
import { ladderFromIdealProfile } from './spec-from-brief'
import { idealProfileFromBrief } from '@/lib/ai/gate-evaluator'
import { resolveSearchSpec as resolveSpec } from './spec-from-brief'

describe('ladderFromIdealProfile', () => {
  const brief = {
    niche: '', persona: '', market: 'New York', experience_band: { min_years: 6, max_years: 12 },
    title_families: ['Engineering Manager', 'Tech Lead Manager'], current_functions: [], current_title_exclusions: [], adjacent_titles: ['Staff Software Engineer', 'Engineering Lead'],
    feeder_pools: [
      { label: 'Scaling B2B SaaS', companies: ['Rippling', 'Ramp'], role_types: [], priority: 1 },
      { label: 'Growth-stage SaaS', companies: ['Datadog', 'Stripe'], role_types: [], priority: 2 },
    ],
    education: { degrees: ['B.Tech'], fields: ['Engineering'] },
    market_gates: [], jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [],
  }
  const market = { city: 'New York', state: 'New York', country: 'US', work_model: 'onsite' }
  const icp = { must_haves: idealProfileFromBrief(brief, market), sourcing_map: { reasoning: '', requirement_decomposition: [], unwritten_filters: [], recruiter_brief: brief }, competencies: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spec = ladderFromIdealProfile(icp as any)!

  it('never-relaxed rows sit on the base line (years, education); relaxable rows on L1', () => {
    expect(spec.base.map((c) => c.kind)).toEqual(['years_band', 'degree_field'])
    expect(spec.levels[0]).toMatchObject({ label: 'Ideal profile · Rippling' })
    expect(spec.levels[0].criteria.map((c) => c.kind)).toEqual(['location', 'title_current', 'employer_current'])
  })
  it('relaxes companies → titles → location, one per level', () => {
    expect(spec.levels.map((l) => l.label)).toEqual(['Ideal profile · Rippling', 'Ideal profile · Ramp', 'Wider companies', 'Wider titles', 'Wider location'])
    const l2 = spec.levels[2].criteria; const l3 = spec.levels[3].criteria; const l4 = spec.levels[4].criteria
    expect(l2.find((c) => c.kind === 'employer_current')?.values).toEqual(['Datadog', 'Stripe'])
    expect(l2.find((c) => c.kind === 'title_current')?.values).toEqual(['Engineering Manager', 'Tech Lead Manager'])
    expect(l3.some((c) => c.kind === 'employer_current')).toBe(false)
    expect(l3.find((c) => c.kind === 'title_current')?.values).toEqual(['Staff Software Engineer', 'Engineering Lead'])
    expect(l4.find((c) => c.kind === 'location')?.radius_km).toBe(150)
    expect(l4.find((c) => c.kind === 'title_current')?.values).toEqual(['Engineering Manager', 'Tech Lead Manager', 'Staff Software Engineer', 'Engineering Lead'])
  })
  it('L1 keeps the ideal-profile ids so bought people are vendor-verified on them; wider levels get their own', () => {
    expect(spec.levels[0].criteria.map((c) => c.id)).toEqual(['ip-location', 'ip-titles', 'ip-companies'])
    expect(spec.levels[2].criteria.find((c) => c.kind === 'employer_current')?.id).toBe('ip-companies-l2')
  })
  it('is null for an ICP without an ideal profile (legacy gates keep the pool-based plan)', () => {
    expect(ladderFromIdealProfile({ must_haves: [{ id: 'x', label: 'Has SQL?', attribute: '', operator: '', value: '' }] })).toBeNull()
  })
  it('a stored spec takes only the never-relaxed rows as its base', () => {
    const stored = { ...spec, source: 'edited' as const, base: [{ id: 'old', kind: 'years_band' as const, values: [], min: 1, max: 3 }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveSpec({ ...icp, sourcing_map: { ...icp.sourcing_map, search_spec: stored } } as any)
    expect(r.stored).toBe(true)
    expect(r.spec.base.map((c) => c.kind)).toEqual(['years_band', 'degree_field'])
    expect(r.spec.base.some((c) => c.kind === 'employer_current')).toBe(false)
  })
})
