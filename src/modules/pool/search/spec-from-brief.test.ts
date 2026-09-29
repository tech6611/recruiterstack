import { describe, it, expect } from 'vitest'
import { specFromIcp, employerTerms } from './spec-from-brief'
import { compileSpec } from '@/modules/pool/vendors/crustdata/compile-spec'
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
import { idealProfileFromBrief as buildProfile, titleTerms } from '@/lib/ai/gate-evaluator'
import { mustHaveFromCriterion } from '@/lib/icp-gates'

/**
 * A profile in the PRE-BET shape — one "Current title" row (the role's titles) and one
 * "Currently at" row (the first pool's companies) — as every profile approved before
 * bets has (V6 of the Strategy & Ops job). These tests pin the planner for that shape,
 * which still runs until a profile is organised into bets.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function idealProfileFromBrief(brief: any, market: any) {
  const rows = buildProfile(brief, market)
  const out = rows.filter((r) => r.bet == null)
  const titles = Array.from(new Set((brief.title_families ?? []).flatMap(titleTerms))) as string[]
  if (titles.length) out.push(mustHaveFromCriterion({ id: 'ip-titles', kind: brief.title_basis === 'past' ? 'title_any' : 'title_current', values: titles, relax_at: 3 }))
  const first = rows.find((r) => r.bet === 1 && r.kind === 'employer_current')
  if (first) out.push(mustHaveFromCriterion({ id: 'ip-companies', kind: 'employer_current', values: first.values ?? [], relax_at: 2 }))
  return out
}
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
  it('exhausts reasoned company tiers at the SAME title, then former employees, then feeder titles, then location', () => {
    expect(spec.levels.map((l) => l.label)).toEqual([
      'Ideal profile · Rippling', 'Ideal profile · Ramp', 'Growth-stage SaaS',
      'Formerly at: Scaling B2B SaaS', 'Formerly at: Growth-stage SaaS',
      'Feeder titles · target companies', 'Feeder titles · any company', 'Wider location',
    ])
    // A company tier widens the companies but keeps the EXACT title.
    const tier = spec.levels[2].criteria
    expect(tier.find((c) => c.kind === 'employer_current')?.values).toEqual(['Datadog', 'Stripe'])
    expect(tier.find((c) => c.kind === 'title_current')?.values).toEqual(['Engineering Manager', 'Tech Lead Manager'])
    // Feeder titles apply across the SAME broadened company set (not "any company" first).
    const feederAtCompanies = spec.levels[5].criteria
    expect(feederAtCompanies.find((c) => c.kind === 'employer_current')?.values).toEqual(['Rippling', 'Ramp', 'Datadog', 'Stripe'])
    expect(feederAtCompanies.find((c) => c.kind === 'title_current')?.values).toEqual(['Staff Software Engineer', 'Engineering Lead'])
    // Then feeder titles with no company constraint.
    expect(spec.levels[6].criteria.some((c) => c.kind === 'employer_current')).toBe(false)
    // Location widens LAST (3× radius, every title so far).
    const loc = spec.levels[7].criteria
    expect(loc.find((c) => c.kind === 'location')?.radius_km).toBe(150)
    expect(loc.find((c) => c.kind === 'title_current')?.values).toEqual(['Engineering Manager', 'Tech Lead Manager', 'Staff Software Engineer', 'Engineering Lead'])
  })
  it('L1 keeps the ideal-profile ids so bought people are vendor-verified on them; wider levels get their own', () => {
    expect(spec.levels[0].criteria.map((c) => c.id)).toEqual(['ip-location', 'ip-titles', 'ip-companies'])
    expect(spec.levels[2].criteria.find((c) => c.kind === 'employer_current')?.id).toBe('ip-companies-t-growth-stage-saas')
  })
  it('searches each pool for the titles its own people hold, not only the role\'s titles', () => {
    // A McKinsey consultant is a "Business Analyst" or "Associate", never a current
    // "Strategy Manager" — pairing consulting firms with only the role's titles found
    // nobody, so the consulting bet the brief wanted first was never reached.
    const so = {
      ...brief, title_families: ['Strategy Manager', 'Chief of Staff'], adjacent_titles: [],
      feeder_pools: [
        { label: 'Top-Tier Consulting', companies: ['McKinsey & Company'], role_types: ['Business Analyst', 'Associate', 'Consultant'], priority: 1 },
        { label: 'Startup BizOps', companies: ['Swiggy'], role_types: ['Strategy Manager', 'Program Manager'], priority: 2 },
        { label: 'IB / VC', companies: ['Goldman Sachs'], role_types: ['Analyst'], priority: 3 },
      ],
    }
    const soIcp = { must_haves: idealProfileFromBrief(so, market), sourcing_map: { reasoning: '', requirement_decomposition: [], unwritten_filters: [], recruiter_brief: so }, competencies: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = ladderFromIdealProfile(soIcp as any)!
    const titlesAt = (label: string) => s.levels.find((l) => l.label.includes(label))!.criteria.find((c) => c.kind === 'title_current')!
    // The profile's title row itself stays the role's titles.
    expect(soIcp.must_haves.find((g) => g.kind === 'title_current')?.values).toEqual(['Strategy Manager', 'Chief of Staff'])
    // Each company lane adds its own pool's titles (no duplicates).
    expect(titlesAt('McKinsey').values).toEqual(['Strategy Manager', 'Chief of Staff', 'Business Analyst', 'Associate', 'Consultant'])
    expect(titlesAt('McKinsey').id).toBe('ip-titles')
    expect(titlesAt('Startup BizOps').values).toEqual(['Strategy Manager', 'Chief of Staff', 'Program Manager'])
    expect(titlesAt('IB / VC')).toMatchObject({ id: 'ip-titles-p-ib-vc', values: ['Strategy Manager', 'Chief of Staff', 'Analyst'] })
    // Widening the location does NOT carry a pool's generic titles ("Associate") to every company.
    expect(titlesAt('Wider location').values).toEqual(['Strategy Manager', 'Chief of Staff'])
  })
  describe('what the older planner did, now in the ideal-profile ladder', () => {
    // The Strategy & Operations Manager brief: pedigree is a market gate, pool 1 is MBB.
    const so = {
      ...brief, market: 'Bengaluru', title_families: ['Strategy Manager'], adjacent_titles: [],
      market_gates: [{ requirement: 'Degree from a top university', why: 'pedigree screen' }],
      target_schools: { tier1: ['IIT', 'IIM'], tier2: ['NIT'] },
      feeder_pools: [
        { label: 'Top-Tier Consulting', companies: ['McKinsey & Company', 'Bain & Company'], role_types: ['Associate', 'Consultant'], priority: 1 },
        { label: 'Startup BizOps', companies: ['Swiggy'], role_types: [], priority: 2 },
      ],
    }
    const bengaluru = { city: 'Bengaluru', state: 'Karnataka', country: 'IN', work_model: 'onsite' }
    const soIcp = { must_haves: idealProfileFromBrief(so, bengaluru), sourcing_map: { reasoning: '', requirement_decomposition: [], unwritten_filters: [], recruiter_brief: so }, competencies: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = ladderFromIdealProfile(soIcp as any, { roleContext: { market: bengaluru } as any })!
    const at = (label: string) => s.levels.find((l) => l.label === label)!.criteria
    const kinds = (label: string) => at(label).map((c) => c.kind).sort()

    it('searches a firm once, under all its names', () => {
      const soBcg = { ...so, feeder_pools: [{ ...so.feeder_pools[0], companies: ['McKinsey & Company', 'Boston Consulting Group (BCG)'] }, so.feeder_pools[1]] }
      const i2 = { ...soIcp, must_haves: idealProfileFromBrief(soBcg, bengaluru), sourcing_map: { ...soIcp.sourcing_map, recruiter_brief: soBcg } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ideal = ladderFromIdealProfile(i2 as any)!.levels.filter((l) => l.ideal)
      expect(ideal.map((l) => l.criteria.find((c) => c.kind === 'employer_current')?.values)).toEqual([['McKinsey'], ['Boston Consulting Group', 'BCG']])
    })
    it('the profile carries tier-1 schools as a search preference, never a reject', () => {
      const row = soIcp.must_haves.find((g) => g.kind === 'school')!
      expect(row).toMatchObject({ values: ['IIT', 'IIM'], enforcement: 'sourcing_only' })
      expect(row.relax_at).not.toBeNull()
    })
    it('orders: current employers → former employees → tier-2 schools → wider location', () => {
      expect(s.levels.map((l) => l.label)).toEqual([
        'Ideal profile · McKinsey', 'Ideal profile · Bain', 'Startup BizOps',
        'Formerly at: Top-Tier Consulting', 'Formerly at: Startup BizOps',
        'Tier-2 school · target companies', 'Wider location',
      ])
    })
    it('currently at a consulting firm means currently consulting there', () => {
      expect(at('Ideal profile · McKinsey').find((c) => c.kind === 'function')?.values).toEqual(['Consulting'])
      // A non-consulting pool gets no function filter.
      expect(kinds('Startup BizOps')).not.toContain('function')
      // Nor does a former-employee lane: moving out of consulting is the point.
      expect(kinds('Formerly at: Top-Tier Consulting')).not.toContain('function')
    })
    it('a former consultant is found wherever they are now', () => {
      const was = at('Formerly at: Top-Tier Consulting')
      expect(was.find((c) => c.kind === 'employer_past')?.values).toEqual(['McKinsey', 'Bain'])
      expect(was.find((c) => c.kind === 'title_any')?.values).toEqual(['Strategy Manager', 'Associate', 'Consultant'])
    })
    it('tier-1 on every company lane, tier-2 once at all targets, then no school', () => {
      for (const l of ['Ideal profile · McKinsey', 'Startup BizOps', 'Formerly at: Startup BizOps']) {
        expect(at(l).find((c) => c.kind === 'school')?.values).toEqual(['IIT', 'IIM'])
      }
      const t2 = at('Tier-2 school · target companies')
      expect(t2.find((c) => c.kind === 'school')?.values).toEqual(['NIT'])
      expect(t2.find((c) => c.kind === 'employer_any')?.values).toEqual(['McKinsey', 'Bain', 'Swiggy'])
      expect(kinds('Wider location')).not.toContain('school')
    })
  })
  it('after every current employer, looks for the same people who have since moved on', () => {
    // An engineering manager who left Rippling for another company is still the bet.
    const was = spec.levels.find((l) => l.label === 'Formerly at: Scaling B2B SaaS')!.criteria
    expect(was.find((c) => c.kind === 'employer_past')).toMatchObject({ id: 'ip-companies-was-scaling-b2b-saas', values: ['Rippling', 'Ramp'] })
    // Held the title at some point — not necessarily in their current job.
    expect(was.find((c) => c.kind === 'title_any')?.values).toEqual(['Engineering Manager', 'Tech Lead Manager'])
    expect(was.some((c) => c.kind === 'employer_current')).toBe(false)
  })
  it('a plain SaaS brief gets no school row, no consulting filter and no tier-2 step', () => {
    expect(icp.must_haves.some((g) => g.kind === 'school')).toBe(false)
    expect(spec.levels.some((l) => l.criteria.some((c) => c.kind === 'function' || c.kind === 'school'))).toBe(false)
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
  it('marks the ideal-profile lines, and only those', () => {
    expect(spec.levels.filter((l) => l.ideal).map((l) => l.label)).toEqual(['Ideal profile · Rippling', 'Ideal profile · Ramp'])
  })
  it('a stored plan takes its ideal lines from the CURRENT must-haves and keeps its own widening levels', () => {
    // The plan was saved when the ideal companies were Rippling + Ramp, with a hand-added level.
    const handAdded = { id: 'LX', label: 'Hand-added · fintech', criteria: [{ id: 'hx', kind: 'employer_current' as const, values: ['Brex'] }], relaxes: null }
    const stored = { ...spec, source: 'edited' as const, levels: [...spec.levels, handAdded] }
    // Then the Scoring tab changed the ideal companies to Deel only.
    const mustHaves = icp.must_haves.map((g) => (g.kind === 'employer_current' ? { ...g, values: ['Deel'] } : g))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveSpec({ ...icp, must_haves: mustHaves, sourcing_map: { ...icp.sourcing_map, search_spec: stored } } as any)
    const labels = r.spec.levels.map((l) => l.label)
    expect(labels.filter((l) => l.startsWith('Ideal profile'))).toEqual(['Ideal profile · Deel'])
    expect(labels).toContain('Growth-stage SaaS')
    expect(labels[labels.length - 1]).toBe('Hand-added · fintech')
  })
  it('recognises ideal lines in plans saved before the flag existed', () => {
    expect(isIdealLevel({ label: 'Ideal profile · Rippling' })).toBe(true)
    expect(isIdealLevel({ label: 'Growth-stage SaaS' })).toBe(false)
    expect(isIdealLevel({ label: 'Anything', ideal: true })).toBe(true)
  })

  // ── A Scoring change flows into EVERY level of a saved plan ───────────────────
  const savedWith = (levels: typeof spec.levels) => ({ ...spec, source: 'edited' as const, levels })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveWith = (mustHaves: any[], stored: any) => resolveSpec({ ...icp, must_haves: mustHaves, sourcing_map: { ...icp.sourcing_map, search_spec: stored } } as any).spec
  const retitle = icp.must_haves.map((g) => (g.kind === 'title_current' && !g.exclude ? { ...g, values: ['Director of Engineering'] } : g))

  it('a title change on Scoring reaches the saved widening levels, not just the ideal lines', () => {
    const r = resolveWith(retitle, savedWith(spec.levels))
    const tier = r.levels.find((l) => l.label === 'Growth-stage SaaS')!
    expect(tier.criteria.find((c) => c.kind === 'title_current')?.values).toEqual(['Director of Engineering'])
    expect(tier.criteria.find((c) => c.kind === 'title_current')?.linked).toBe(true)
    // The widened location's "every title" follows too.
    const wider = r.levels.find((l) => l.label === 'Wider location')!
    expect(wider.criteria.find((c) => c.kind === 'title_current')?.values).toContain('Director of Engineering')
    expect(wider.criteria.find((c) => c.kind === 'title_current')?.values).not.toContain('Engineering Manager')
  })
  it('keeps what the recruiter added by hand', () => {
    const tier = spec.levels.find((l) => l.label === 'Growth-stage SaaS')!
    const handFilter = { id: 'hand-1', kind: 'skill' as const, values: ['Kubernetes'] }
    const handLevel = { id: 'LX', label: 'Hand-added · fintech', criteria: [{ id: 'hx', kind: 'employer_current' as const, values: ['Brex'] }], relaxes: null }
    const stored = savedWith([...spec.levels.map((l) => (l.id === tier.id ? { ...l, criteria: [...l.criteria, handFilter] } : l)), handLevel])
    const r = resolveWith(retitle, stored)
    expect(r.levels.find((l) => l.label === 'Growth-stage SaaS')!.criteria.find((c) => c.id === 'hand-1')?.values).toEqual(['Kubernetes'])
    expect(r.levels.find((l) => l.id === 'LX')?.criteria[0].values).toEqual(['Brex'])
  })
  it('a location change moves every widened location, keeping its own radius', () => {
    const moved = icp.must_haves.map((g) => (g.kind === 'location' ? { ...g, values: ['Austin'] } : g))
    const adaptive = { id: 'LA1', label: 'Wider still', criteria: [{ id: 'adapt-0-loc', kind: 'location' as const, values: ['New York'], radius_km: 450, from: 'ip-location' }], relaxes: null }
    const r = resolveWith(moved, savedWith([...spec.levels, adaptive]))
    expect(r.levels.find((l) => l.label === 'Wider location')!.criteria.find((c) => c.kind === 'location')?.values).toEqual(['Austin'])
    const still = r.levels.find((l) => l.id === 'LA1')!.criteria[0]
    expect(still.values).toEqual(['Austin'])
    expect(still.radius_km).toBe(450)
  })
  it('drops a saved level whose defining profile field was removed on Scoring', () => {
    const noCompanies = icp.must_haves.filter((g) => !g.kind?.startsWith('employer_'))
    const r = resolveWith(noCompanies, savedWith(spec.levels))
    expect(r.levels.map((l) => l.label)).not.toContain('Growth-stage SaaS')
  })
  it('refreshes the checks-after-fetch list from the profile', () => {
    const stored = { ...savedWith(spec.levels), post_fetch: [{ label: 'An old competency', how: 'judge' as const }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolveSpec({ ...icp, competencies: [{ id: 'c1', name: 'Hiring bar', weight: 100, behaviours: [] }], sourcing_map: { ...icp.sourcing_map, search_spec: stored } } as any).spec
    expect(r.post_fetch.map((p) => p.label)).toContain('Hiring bar')
    expect(r.post_fetch.map((p) => p.label)).not.toContain('An old competency')
  })
})

// ── Saving a plan must not drop fields (the save used to strip these) ────────────
import { searchSpecSchema } from '@/lib/validations/search-spec'
import { isIdealLevel } from './spec-from-brief'

describe('searchSpecSchema', () => {
  it('keeps relax_at on criteria and fallback / ideal on levels', () => {
    const parsed = searchSpecSchema.parse({
      version: 1, base: [], source: 'edited',
      levels: [{ id: 'L1', label: 'Ideal', ideal: true, fallback: true, criteria: [{ id: 'c', kind: 'title_current', values: ['EM'], relax_at: 3 }] }],
    })
    expect(parsed.levels[0]).toMatchObject({ ideal: true, fallback: true })
    expect(parsed.levels[0].criteria[0].relax_at).toBe(3)
  })
})

describe('the bet ladder — each company group searched with its own titles', () => {
  const bengaluru = { city: 'Bengaluru', state: 'Karnataka', country: 'IN', work_model: 'onsite' }
  const so = {
    niche: '', persona: '', market: 'Bengaluru', experience_band: { min_years: 2, max_years: 6 },
    title_families: ['Strategy & Operations Manager', 'Chief of Staff'], adjacent_titles: [], current_functions: [], current_title_exclusions: [],
    market_gates: [{ requirement: 'Degree from a top university' }], target_schools: { tier1: ['IIT', 'IIM'], tier2: ['NIT'] },
    feeder_pools: [
      { label: 'Top-Tier Consulting', companies: ['McKinsey & Company', 'Bain & Company', 'Boston Consulting Group (BCG)'], role_types: ['Business Analyst', 'Associate', 'Consultant'], priority: 1 },
      { label: 'Startup BizOps', companies: ['Udaan', 'Swiggy'], role_types: ['Strategy Manager'], priority: 2 },
      { label: 'IB / VC', companies: ['Goldman Sachs'], role_types: ['Analyst', 'Associate'], priority: 3 },
    ],
    jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [],
  }
  const cards = [
    { name: 'The Classic Post-Consulting Operator', thesis: '', where_from: 'Associate at McKinsey, Bain, or BCG.' },
    { name: 'The Scaled Startup BizOps Star', thesis: '', where_from: 'BizOps at Udaan or Swiggy.' },
    { name: 'The IB/VC Analyst', thesis: '', where_from: 'Analyst at Goldman Sachs.' },
  ]
  const must_haves = buildProfile(so, bengaluru, { archetypes: cards })
  const icp = { must_haves, sourcing_map: { reasoning: '', requirement_decomposition: [], unwritten_filters: [], recruiter_brief: so, archetypes: cards }, competencies: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = ladderFromIdealProfile(icp as any, { roleContext: { market: bengaluru } as any })!
  const at = (label: string) => s.levels.find((l) => l.label === label)!.criteria
  const of = (label: string, kind: string) => at(label).find((c) => c.kind === kind)

  it('walks bet 1 firm by firm, then each bet, then each bet\'s former employees, then tier-2, then wider location', () => {
    expect(s.levels.map((l) => l.label)).toEqual([
      'Ideal profile · McKinsey', 'Ideal profile · Bain', 'Ideal profile · Boston Consulting Group (BCG)',
      'Bet 2: The Scaled Startup BizOps Star', 'Bet 3: The IB/VC Analyst',
      'Formerly at: The Classic Post-Consulting Operator', 'Formerly at: The Scaled Startup BizOps Star', 'Formerly at: The IB/VC Analyst',
      'Tier-2 school · target companies', 'Wider location',
    ])
  })
  it('each bet is searched for ONLY its own titles', () => {
    expect(of('Ideal profile · McKinsey', 'title_current')?.values).toEqual(['Business Analyst', 'Associate', 'Consultant'])
    expect(of('Bet 2: The Scaled Startup BizOps Star', 'title_current')?.values).toEqual(['Strategy Manager'])
    expect(of('Bet 3: The IB/VC Analyst', 'title_current')?.values).toEqual(['Analyst', 'Associate'])
  })
  it('a firm with two names is one line; consulting firms mean consulting', () => {
    expect(of('Ideal profile · Boston Consulting Group (BCG)', 'employer_current')?.values).toEqual(['Boston Consulting Group', 'BCG'])
    expect(of('Ideal profile · McKinsey', 'function')?.values).toEqual(['Consulting'])
    expect(of('Bet 2: The Scaled Startup BizOps Star', 'function')).toBeUndefined()
  })
  it('the profile rows ARE the search rows: edits on Scoring are what runs, and bought people are vendor-verified', () => {
    expect(of('Ideal profile · McKinsey', 'employer_current')?.id).toBe('ip-bet-1-companies')
    expect(of('Bet 2: The Scaled Startup BizOps Star', 'employer_current')?.id).toBe('ip-bet-2-companies')
    expect(of('Bet 2: The Scaled Startup BizOps Star', 'title_current')?.id).toBe('ip-bet-2-titles')
  })
  it('former employees: worked at the bet\'s companies, held its titles at some point', () => {
    expect(of('Formerly at: The Classic Post-Consulting Operator', 'employer_past')?.values).toEqual(['McKinsey', 'Bain', 'Boston Consulting Group', 'BCG'])
    expect(of('Formerly at: The Classic Post-Consulting Operator', 'title_any')?.values).toEqual(['Business Analyst', 'Associate', 'Consultant'])
  })
  it('tier-1 schools on every company line; tier-2 once over all bets; none when no company is named', () => {
    expect(of('Bet 3: The IB/VC Analyst', 'school')?.values).toEqual(['IIT', 'IIM'])
    expect(of('Tier-2 school · target companies', 'school')?.values).toEqual(['NIT'])
    expect(of('Tier-2 school · target companies', 'employer_any')?.values).toEqual(['McKinsey', 'Bain', 'Boston Consulting Group', 'BCG', 'Udaan', 'Swiggy', 'Goldman Sachs'])
    expect(of('Wider location', 'school')).toBeUndefined()
  })
  it('the wider location uses the role\'s own titles, never a bet\'s "Associate"', () => {
    expect(of('Wider location', 'title_current')?.values).toEqual(['Strategy & Operations Manager', 'Chief of Staff'])
  })
  it('an edit to a bet on Scoring reaches its search line', () => {
    const edited = must_haves.map((g) => (g.id === 'ip-bet-2-titles' ? { ...g, values: ['Chief of Staff'] } : g))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s2 = ladderFromIdealProfile({ ...icp, must_haves: edited } as any)!
    expect(s2.levels.find((l) => l.label.startsWith('Bet 2'))!.criteria.find((c) => c.kind === 'title_current')?.values).toEqual(['Chief of Staff'])
  })
  it('a plan built from bets passes the plan save check', () => {
    expect(searchSpecSchema.safeParse(s).success).toBe(true)
  })
  describe('a bet\'s own rows (Scoring → "Only this bet") run in that bet\'s levels only', () => {
    const loc = must_haves.find((g) => g.kind === 'location' && g.bet == null)!
    const yrs = must_haves.find((g) => g.kind === 'years_band' && g.bet == null)!
    const ib = { bet: 3, bet_label: 'The IB/VC Analyst' }
    const withOverrides = [
      ...must_haves,
      mustHaveFromCriterion({ id: `${loc.id}@bet3`, kind: 'location', values: ['Mumbai, Maharashtra, IN'], radius_km: 25, relax_at: loc.relax_at ?? null, ...ib }),
      mustHaveFromCriterion({ id: `${yrs.id}@bet3`, kind: 'years_band', values: [], min: 4, max: 10, relax_at: null, ...ib }),
      mustHaveFromCriterion({ id: 'mh-cfa@bet3', kind: 'skill', values: ['Financial Modeling'], relax_at: null, ...ib }),
    ]
    const ctx = { roleContext: { market: bengaluru } } as never
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec = resolveSpec({ ...icp, must_haves: withOverrides } as any, ctx).spec
    const lvl = (label: string) => spec.levels.find((l) => l.label === label)!
    const text = (label: string) => JSON.stringify(lvl(label).criteria)

    it('the shared ladder itself is unchanged', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s2 = ladderFromIdealProfile({ ...icp, must_haves: withOverrides } as any, ctx)!
      const noIds = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'id' ? undefined : v))
      expect(noIds(s2)).toEqual(noIds(s))
      expect(spec.levels.map((l) => l.label)).toEqual(s.levels.map((l) => l.label))
    })

    it('bet 3 and its former employees search Mumbai, 4–10 years and the bet-only skill', () => {
      for (const label of ['Bet 3: The IB/VC Analyst', 'Formerly at: The IB/VC Analyst']) {
        const cs = lvl(label).criteria
        expect(cs.find((c) => c.kind === 'location')).toMatchObject({ values: ['Mumbai, Maharashtra, IN'], replaces: loc.id })
        expect(cs.find((c) => c.kind === 'years_band')).toMatchObject({ min: 4, max: 10, replaces: yrs.id })
        expect(cs.find((c) => c.kind === 'skill')).toMatchObject({ values: ['Financial Modeling'], replaces: null })
      }
    })

    it('every other level keeps the shared rows', () => {
      for (const label of ['Ideal profile · McKinsey', 'Bet 2: The Scaled Startup BizOps Star', 'Formerly at: The Classic Post-Consulting Operator', 'Tier-2 school · target companies', 'Wider location']) {
        expect(text(label)).not.toContain('Mumbai')
        expect(text(label)).not.toContain('@bet3')
      }
      expect(spec.base.find((c) => c.kind === 'years_band')).toMatchObject({ min: 2, max: 6 })
    })

    it('the compiled bet-3 lane drops the shared years for its own, and counts the shared rows as searched', () => {
      const plan = compileSpec(spec)
      const lane = (label: string) => plan.lanes.find((l) => l.label === label)!
      const bet3 = JSON.stringify(lane('Bet 3: The IB/VC Analyst').filters)
      const bet2 = JSON.stringify(lane('Bet 2: The Scaled Startup BizOps Star').filters)
      expect(bet3).toContain('Mumbai')
      expect(bet3.match(/years_of_experience_raw/g)?.length).toBe(2) // one band = a => and a =< condition
      expect(bet3).toMatch(/"years_of_experience_raw","type":"=<","value":10\b/)
      expect(bet3).not.toMatch(/"years_of_experience_raw","type":"=<","value":6\b/)
      expect(bet2).toMatch(/"years_of_experience_raw","type":"=<","value":6\b/)
      expect(lane('Bet 3: The IB/VC Analyst').criterionIds).toEqual(expect.arrayContaining([loc.id, yrs.id, `${yrs.id}@bet3`]))
    })

    it('a saved plan follows today\'s bet rows — a removed one does not linger', () => {
      const saved = { ...icp.sourcing_map, search_spec: spec }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const again = resolveSpec({ ...icp, must_haves: withOverrides, sourcing_map: saved } as any, ctx).spec
      expect(JSON.stringify(again.levels.find((l) => l.label === 'Bet 3: The IB/VC Analyst')!.criteria)).toContain('Mumbai')
      expect(JSON.stringify(again).match(/@bet3/g)?.length).toBe(JSON.stringify(spec).match(/@bet3/g)?.length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reverted = resolveSpec({ ...icp, must_haves, sourcing_map: saved } as any, ctx).spec
      expect(JSON.stringify(reverted)).not.toContain('Mumbai')
      expect(JSON.stringify(reverted)).not.toContain('@bet3')
      expect(reverted.levels.find((l) => l.label === 'Bet 3: The IB/VC Analyst')!.criteria.find((c) => c.kind === 'location')?.id).toBe(loc.id)
    })
  })
})

describe('a plan always saves', () => {
  it('drops a profile label too long for a plan (the School row lists every institute)', () => {
    const schools = Array.from({ length: 16 }, (_, i) => `Institute of Technology number ${i}`)
    const must_haves = [
      mustHaveFromCriterion({ id: 'ip-location', kind: 'location', values: ['Bengaluru'], radius_km: 50, relax_at: 4 }),
      mustHaveFromCriterion({ id: 'ip-school', kind: 'school', values: schools, relax_at: 3 }),
      mustHaveFromCriterion({ id: 'ip-titles', kind: 'title_current', values: ['Strategy Manager'], relax_at: 3 }),
    ]
    expect(must_haves[1].label.length).toBeGreaterThan(120)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec = ladderFromIdealProfile({ must_haves } as any)!
    expect(searchSpecSchema.safeParse(spec).success).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(searchSpecSchema.safeParse(resolveSpec({ must_haves, sourcing_map: { search_spec: spec } } as any).spec).success).toBe(true)
  })
})
