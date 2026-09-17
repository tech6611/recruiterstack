import { describe, it, expect } from 'vitest'
import { buildSearchPlan, companyQueryTerms, yearsFloorFromLabel, isPlanRunnable } from './search-plan'
import type { Icp } from '@/lib/types/icp'

const brief = {
  niche: 'Strategy & Ops recruiter, Bengaluru', persona: 'p', market: 'Bengaluru',
  feeder_pools: [
    { label: 'BizOps at scale-ups', companies: ['Razorpay, CRED', 'Swiggy'], role_types: ['Business Operations Manager', "Founder's Office"], priority: 2 },
    { label: 'Top-tier consulting', companies: ['McKinsey & Company', 'Boston Consulting Group (BCG)', 'Bain & Company'], role_types: ['Business Analyst, Associate'], priority: 1 },
    { label: 'Empty pool', companies: [], role_types: ['x'], priority: 3 },
  ],
  title_families: ['BizOps Manager', 'Chief of Staff'],
  market_gates: [], jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [],
}
const icp = {
  must_haves: [
    { id: 'g0', label: 'Is the core background in consulting, IB/VC/PE, or BizOps?', attribute: '', operator: '', value: '' },
    { id: 'g1', label: 'Does the candidate have at least 2 full years of post-graduation experience?', attribute: '', operator: '', value: '' },
    { id: 'g2', label: 'Does the CV explicitly mention SQL?', attribute: '', operator: '', value: '' },
  ],
  sourcing_map: { reasoning: '', requirement_decomposition: [], unwritten_filters: [], recruiter_brief: brief },
} as unknown as Pick<Icp, 'must_haves' | 'sourcing_map'>
const roleContext = {
  market: { site: 'Bangalore Back Office', city: 'Bengaluru', state: 'Karnataka', country: 'IN', timezone: 'IST', work_model: 'onsite' },
  company: null,
}

describe('companyQueryTerms', () => {
  it('splits lists, lifts parentheticals, and drops legal suffixes', () => {
    expect(companyQueryTerms('Boston Consulting Group (BCG)')).toEqual(['Boston Consulting Group', 'BCG'])
    expect(companyQueryTerms('McKinsey & Company')).toEqual(['McKinsey'])
    expect(companyQueryTerms('Razorpay, CRED / Swiggy')).toEqual(['Razorpay', 'CRED', 'Swiggy'])
    expect(companyQueryTerms('Infosys Ltd.')).toEqual(['Infosys'])
  })
})

describe('yearsFloorFromLabel', () => {
  it('reads a floor from plain-sentence gates and ignores unrelated numbers', () => {
    expect(yearsFloorFromLabel('at least 2 full years of post-graduation experience?')).toBe(2)
    expect(yearsFloorFromLabel('5+ years in payments')).toBe(5)
    expect(yearsFloorFromLabel('Does the CV mention SQL (top 3 skills)?')).toBeNull()
  })
})

describe('buildSearchPlan', () => {
  const plan = buildSearchPlan(icp, { title: 'Strategy & Operations Manager', roleContext })

  it('runs feeder lanes in priority order, then the titles lane', () => {
    expect(plan.lanes.map((l) => `${l.kind}:${l.label}`)).toEqual([
      'feeder:Top-tier consulting',
      'feeder:BizOps at scale-ups',
      'titles:Title families',
    ])
  })

  it('feeder lanes match the employer across ANY role with all-words terms, narrowed by role type', () => {
    const consulting = plan.lanes[0]
    const [companies, roles] = consulting.filters.conditions as { op: string; conditions: { field: string; type: string; value: string }[] }[]
    expect(companies.op).toBe('or')
    expect(companies.conditions.map((c) => c.value)).toEqual(['McKinsey', 'Boston Consulting Group', 'BCG', 'Bain'])
    expect(companies.conditions.every((c) => c.field === 'experience.employment_details.company_name' && c.type === '(.)')).toBe(true)
    expect(roles.conditions.map((c) => c.value)).toEqual(['Business Analyst', 'Associate'])
    expect(consulting.summary[0]).toContain('McKinsey / Boston Consulting Group / BCG / Bain')
  })

  it('every lane carries the market radius and the years floor; plain gates are reported as unmapped', () => {
    expect(plan.common.map((c) => c.label)).toEqual(['within 50 km of Bengaluru, Karnataka, India', '2+ years of experience'])
    for (const l of plan.lanes) {
      const conds = l.filters.conditions as { field?: string; type?: string; value?: unknown }[]
      expect(conds.some((c) => c.type === 'geo_distance' && (c.value as { location: string }).location === 'Bengaluru, Karnataka, India')).toBe(true)
      expect(conds.some((c) => c.field === 'years_of_experience_raw' && c.type === '=>' && c.value === 2)).toBe(true)
    }
    expect(plan.unmapped.map((u) => u.requirement)).toEqual([
      'Is the core background in consulting, IB/VC/PE, or BizOps?',
      'Does the CV explicitly mention SQL?',
    ])
  })

  it('titles lane covers the job title plus the brief title families on the CURRENT title', () => {
    const titles = plan.lanes[2]
    const [group] = titles.filters.conditions as { conditions: { field: string; value: string }[] }[]
    expect(group.conditions.map((c) => c.value)).toEqual(['Strategy & Operations Manager', 'BizOps Manager', 'Chief of Staff'])
    expect(group.conditions[0].field).toBe('experience.employment_details.current.title')
  })

  it('skips the geo filter for remote roles and falls back to a single title lane without a brief', () => {
    const remote = buildSearchPlan(icp, { title: 'T', roleContext: { ...roleContext, market: { ...roleContext.market, work_model: 'remote' } } })
    expect(remote.common.map((c) => c.label)).toEqual(['2+ years of experience'])
    const noBrief = buildSearchPlan({ must_haves: [] }, { title: 'Strategy & Operations Manager' })
    expect(noBrief.lanes.map((l) => l.kind)).toEqual(['title'])
    expect(isPlanRunnable(buildSearchPlan({ must_haves: [] }, {}))).toBe(false)
  })

  it('lane keys are stable for the same filters and change when they change', () => {
    const again = buildSearchPlan(icp, { title: 'Strategy & Operations Manager', roleContext })
    expect(again.lanes.map((l) => l.key)).toEqual(plan.lanes.map((l) => l.key))
    const wider = buildSearchPlan(icp, { title: 'Strategy & Operations Manager', roleContext, locationRadiusKm: 100 })
    expect(wider.lanes[0].key).not.toBe(plan.lanes[0].key)
  })
})

describe('buildSearchPlan (experience band)', () => {
  it('sends the band as a floor AND a ceiling on years_of_experience_raw', () => {
    const plan = buildSearchPlan(
      { must_haves: [{ id: 'g-band', label: 'Has between 2 and 6 years…', attribute: 'experience_band', operator: 'between', value: ['2', '6'] }] },
      { title: 'T' },
    )
    expect(plan.common.map((c) => c.label)).toEqual(['2–6 years of experience', 'no more than 6 years (not over-senior)'])
    expect(plan.common.map((c) => c.condition)).toEqual([
      { field: 'years_of_experience_raw', type: '=>', value: 2 },
      { field: 'years_of_experience_raw', type: '=<', value: 6 },
    ])
    expect(plan.unmapped).toEqual([])
  })
})
