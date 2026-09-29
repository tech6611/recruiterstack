import { describe, it, expect } from 'vitest'
import {
  convertLegacyGates, evaluateMustHaves, titleTerms, isGenericTitleTerm, isCriterion, mustHaveFromCriterion, criterionLabel, SCREENING_ATTRIBUTE,
} from './gate-evaluator'
import type { IcpMustHave } from '@/lib/types/icp'

const legacy = (id: string, label: string, attribute = '', operator = '', value: IcpMustHave['value'] = ''): IcpMustHave => ({ id, label, attribute, operator, value })

describe('titleTerms — whole phrases, never a bare level word', () => {
  it('repairs "Senior / Staff Software Engineer" into two full titles', () => {
    expect(titleTerms('Engineering Manager / Tech Lead Manager / Senior / Staff Software Engineer (promotable)'))
      .toEqual(['Engineering Manager', 'Tech Lead Manager', 'Senior Software Engineer', 'Staff Software Engineer'])
  })
  it('drops a level word that has nothing to attach to', () => {
    expect(titleTerms('Senior')).toEqual([])
    expect(titleTerms('Head of Engineering, Director')).toEqual(['Head of Engineering'])
  })
  it('knows the level words', () => {
    for (const w of ['Senior', 'Sr.', 'Staff', 'Lead', 'Manager', 'Principal', 'Director', 'VP']) expect(isGenericTitleTerm(w)).toBe(true)
    expect(isGenericTitleTerm('Engineering Manager')).toBe(false)
  })
})

describe('convertLegacyGates — the New York job\'s four gates', () => {
  const ctx = { market: { city: 'New York', state: 'New York', country: 'US', work_model: 'onsite' }, titleFamilies: ['Engineering Manager', 'Tech Lead Manager', 'Head of Engineering'] }
  const gates = [
    legacy('g-ai-0', 'Is this candidate\'s primary experience in software engineering leadership (and not an adjacent field like Product or Project Management)?'),
    legacy('g-ai-1', 'Does the candidate have existing authorization to work in the US?'),
    legacy('g-ai-2', 'Is the candidate based in, or willing to immediately relocate to, New York for a fully onsite role?'),
    legacy('g-band', 'Has between 6 and 12 years of professional experience — not over-senior for this role?', 'experience_band', 'between', ['6', '12']),
  ]
  const out = convertLegacyGates(gates, ctx)

  it('turns "primary experience in software engineering" into titles + function', () => {
    const t = out.find((g) => g.kind === 'title_any')!
    expect(t.values).toEqual(['Engineering Manager', 'Tech Lead Manager', 'Head of Engineering'])
    expect(t.id).toBe('g-ai-0')
    expect(t.label).toMatch(/^Is this candidate's primary experience/) // label kept verbatim: snapshots match cells by label
    expect(out.find((g) => g.kind === 'function')).toBeUndefined() // titles carry it; function is only the fallback
  })
  it('falls back to a function gate when the brief has no title families', () => {
    const noTitles = convertLegacyGates([gates[0]], { ...ctx, titleFamilies: [] })
    expect(noTitles[0]).toMatchObject({ kind: 'function', values: ['Engineering'], id: 'g-ai-0' })
  })
  it('keeps work authorization as a screening gate — nothing a profile can answer', () => {
    const s = out.find((g) => g.id === 'g-ai-1')!
    expect(s.attribute).toBe(SCREENING_ATTRIBUTE)
    expect(isCriterion(s)).toBe(false)
  })
  it('turns "based in New York" into a 50 km location criterion from the market', () => {
    const l = out.find((g) => g.kind === 'location')!
    expect(l.id).toBe('g-ai-2')
    expect(l.values).toEqual(['New York, New York, US'])
    expect(l.radius_km).toBe(50)
  })
  it('turns the structured band into years_band 6–12', () => {
    const b = out.find((g) => g.kind === 'years_band')!
    expect([b.min, b.max]).toEqual([6, 12])
    expect(b.label).toMatch(/^Has between 6 and 12 years/)
  })
  it('is idempotent — converting the output changes nothing', () => {
    expect(convertLegacyGates(out, ctx)).toEqual(out)
  })
})

describe('convertLegacyGates — other shapes', () => {
  it('reads "5+ years" and min_experience as a floor', () => {
    expect(convertLegacyGates([legacy('a', '5+ years in payments')])[0]).toMatchObject({ kind: 'years_band', min: 5, max: null })
    expect(convertLegacyGates([legacy('b', 'Experience', 'min_experience', 'gte', '3')])[0]).toMatchObject({ kind: 'years_band', min: 3 })
  })
  it('reads IIM / IIT out of a label as a school criterion', () => {
    expect(convertLegacyGates([legacy('s', 'MBA from IIM or IIT only')])[0]).toMatchObject({ kind: 'school', values: ['IIM', 'IIT'] })
  })
  it('maps an explicit skill attribute', () => {
    expect(convertLegacyGates([legacy('k', 'SQL', 'skill', 'includes', 'SQL')])[0]).toMatchObject({ kind: 'skill', values: ['SQL'] })
  })
  it('"based in" a city that is not the market stays a screening gate rather than guessing', () => {
    const out = convertLegacyGates([legacy('x', 'Based in Pune')], { market: { city: 'New York', state: 'NY', country: 'US', work_model: 'onsite' } })
    expect(out[0].attribute).toBe(SCREENING_ATTRIBUTE)
  })
})

describe('evaluateMustHaves', () => {
  const band = mustHaveFromCriterion({ id: 'yrs', kind: 'years_band', values: [], min: 6, max: 12 })
  const titles = mustHaveFromCriterion({ id: 'ttl', kind: 'title_any', values: ['Engineering Manager', 'Tech Lead Manager'] })
  const loc = mustHaveFromCriterion({ id: 'loc', kind: 'location', values: ['New York, New York, US'], radius_km: 50 })
  const school = mustHaveFromCriterion({ id: 'sch', kind: 'school', values: ['IIM', 'IIT'] })
  const notVp = mustHaveFromCriterion({ id: 'sen', kind: 'title_current', values: ['Vice President'], exclude: true })

  it('band: ±1 year slack, unknown → unverified', () => {
    expect(evaluateMustHaves([band], { experience_years: 11.9 }, {})[0]).toMatchObject({ pass: true, verified_by: 'data' })
    expect(evaluateMustHaves([band], { experience_years: 12.9 }, {})[0].pass).toBe(true)
    expect(evaluateMustHaves([band], { experience_years: 13.2 }, {})[0]).toMatchObject({ pass: false, reason: '13.2 yrs, band 6–12' })
    expect(evaluateMustHaves([band], { experience_years: null }, {})[0]).toMatchObject({ pass: null, verified_by: null })
  })
  it('titles: whole phrase over any role; the 7 non-engineers fail with their title in the reason', () => {
    const em = evaluateMustHaves([titles], {}, { experiences: [{ title: 'Senior Engineering Manager, Platform', is_current: true }] })[0]
    expect(em).toMatchObject({ pass: true, reason: 'title: Engineering Manager' })
    const ae = evaluateMustHaves([titles], { current_title: 'Senior Account Executive' }, { experiences: [{ title: 'Senior Account Executive', is_current: true }] })[0]
    expect(ae.pass).toBe(false)
    expect(evaluateMustHaves([titles], {}, {})[0].pass).toBeNull()
  })
  it('exclude flips the verdict but unverified stays unverified', () => {
    expect(evaluateMustHaves([notVp], { current_title: 'Vice President of Sales' }, {})[0].pass).toBe(false)
    expect(evaluateMustHaves([notVp], { current_title: 'Engineering Manager' }, {})[0].pass).toBe(true)
    expect(evaluateMustHaves([notVp], {}, {})[0].pass).toBeNull()
  })
  it('location: city → region → country, same fallback as recall', () => {
    expect(evaluateMustHaves([loc], { location: 'New York City Metropolitan Area' }, {})[0].pass).toBe(true)
    expect(evaluateMustHaves([loc], { location: 'Bengaluru, India' }, {})[0]).toMatchObject({ pass: false, reason: 'Bengaluru, not New York' })
    expect(evaluateMustHaves([loc], { location: 'Texas, United States' }, {})[0]).toMatchObject({ pass: false, reason: 'Texas, not New York' })
    expect(evaluateMustHaves([loc], { location: 'Remote' }, {})[0].pass).toBeNull()
  })
  it('school: any degree at a listed school; none on file → unverified', () => {
    expect(evaluateMustHaves([school], {}, { education: [{ school: 'IIM Ahmedabad' }] })[0].pass).toBe(true)
    expect(evaluateMustHaves([school], {}, { education: [{ school: 'Delhi University' }] })[0].pass).toBe(false)
    expect(evaluateMustHaves([school], {}, {})[0].pass).toBeNull()
  })
  it('a vendor-filtered criterion holds by construction, before any data check', () => {
    const v = evaluateMustHaves([band], { experience_years: 40 }, {}, { vendorFilteredGateIds: new Set(['yrs']) })[0]
    expect(v).toMatchObject({ pass: true, verified_by: 'vendor' })
  })
  it('kinds we do not store yet are unverified, never failed', () => {
    const fn = mustHaveFromCriterion({ id: 'fn', kind: 'function', values: ['Engineering'] })
    expect(evaluateMustHaves([fn], { current_title: 'Account Executive' }, {})[0].pass).toBeNull()
  })
  it('legacy gates are skipped — they belong to the judge', () => {
    expect(evaluateMustHaves([legacy('x', 'Has passion')], {}, {})).toEqual([])
  })
  it('labels read like a recruiter wrote them', () => {
    expect(criterionLabel({ kind: 'location', values: ['New York'], radius_km: 50 })).toBe('Within 50 km of New York')
    expect(criterionLabel({ kind: 'school', values: ['IIM', 'IIT'] })).toBe('School: IIM / IIT')
    expect(criterionLabel({ kind: 'title_current', values: ['VP'], exclude: true })).toBe('Not Current title: VP')
  })
})

// ── The ideal profile (docs/ideal-profile-plan.md) ────────────────────────────────
import { idealProfileFromBrief, IDEAL_PROFILE_IDS } from './gate-evaluator'

describe('idealProfileFromBrief — the New York job', () => {
  const brief = {
    market: 'New York, onsite',
    experience_band: { min_years: 6, max_years: 12, rationale: '' },
    title_families: ['Engineering Manager', 'Tech Lead Manager / Senior / Staff Software Engineer'],
    feeder_pools: [
      { label: 'Growth-stage SaaS', companies: ['Datadog', 'Stripe'], role_types: [], priority: 2 },
      { label: 'Scaling B2B SaaS (Series A–C)', companies: ['Rippling', 'Ramp', 'Vanta Inc.'], role_types: [], priority: 1 },
    ],
    education: { degrees: ['B.Tech'], fields: ['Engineering', 'Computer Science'] },
  }
  const market = { city: 'New York', state: 'New York', country: 'US', work_model: 'onsite' }
  const out = idealProfileFromBrief(brief, market)
  const by = (id: string) => out.find((g) => g.id === id)!

  it('reads as where · years · education, then one bet per pool in search order', () => {
    expect(out.map((g) => g.kind)).toEqual(['location', 'years_band', 'degree_field', 'employer_current', 'title_current', 'employer_current', 'title_current'])
    expect(out.filter((g) => g.bet != null).map((g) => [g.bet, g.bet_label])).toEqual([
      [1, 'Scaling B2B SaaS (Series A–C)'], [1, 'Scaling B2B SaaS (Series A–C)'], [2, 'Growth-stage SaaS'], [2, 'Growth-stage SaaS'],
    ])
  })
  it('where: the job market, 50 km, relaxes at L4', () => {
    expect(by(IDEAL_PROFILE_IDS.location)).toMatchObject({ values: ['New York, New York, US'], radius_km: 50, relax_at: 4 })
  })
  it('years and education never relax', () => {
    expect(by(IDEAL_PROFILE_IDS.years)).toMatchObject({ min: 6, max: 12, relax_at: null })
    expect(by(IDEAL_PROFILE_IDS.education)).toMatchObject({ values: ['B.Tech', 'Engineering', 'Computer Science'], relax_at: null })
  })
  it('a pool with no titles of its own takes the role\'s — whole titles, never a bare "Senior"', () => {
    expect(by('ip-bet-1-titles')).toMatchObject({ values: ['Engineering Manager', 'Tech Lead Manager', 'Senior Software Engineer', 'Staff Software Engineer'], relax_at: 3, enforcement: 'sourcing_only' })
  })
  it('bet 1 is the priority-1 pool, legal suffixes stripped; a search lane, never a reject', () => {
    expect(by('ip-bet-1-companies')).toMatchObject({ kind: 'employer_current', values: ['Rippling', 'Ramp', 'Vanta'], relax_at: 2, enforcement: 'sourcing_only' })
    expect(by('ip-bet-2-companies').values).toEqual(['Datadog', 'Stripe'])
  })
  it('no pools → no bets: the role\'s titles are the one title row', () => {
    const rows = idealProfileFromBrief({ ...brief, feeder_pools: [] }, market)
    expect(rows.some((g) => g.bet != null)).toBe(false)
    expect(rows.find((g) => g.id === IDEAL_PROFILE_IDS.titles)?.values).toContain('Engineering Manager')
  })
  it('each bet carries its OWN titles, and is named after its card', () => {
    const so = {
      ...brief, title_families: ['Strategy Manager'],
      feeder_pools: [
        { label: 'Top-Tier Consulting', companies: ['McKinsey & Company', 'Boston Consulting Group (BCG)'], role_types: ['Business Analyst', 'Associate', 'Consultant'], priority: 1 },
        { label: 'Startup BizOps', companies: ['Swiggy'], role_types: ['Strategy Manager', 'Program Manager'], priority: 2 },
      ],
    }
    const cards = [
      { name: 'The Scaled Startup BizOps Star', thesis: '', where_from: 'BizOps at Swiggy.' },
      { name: 'The Classic Post-Consulting Operator', thesis: '', where_from: 'Associate at McKinsey, Bain, or BCG.' },
    ]
    const rows = idealProfileFromBrief(so, market, { archetypes: cards })
    const row = (id: string) => rows.find((g) => g.id === id)!
    // McKinsey is searched for consulting titles only — not "Strategy Manager".
    expect(row('ip-bet-1-titles').values).toEqual(['Business Analyst', 'Associate', 'Consultant'])
    expect(row('ip-bet-1-companies').values).toEqual(['McKinsey', 'Boston Consulting Group', 'BCG'])
    expect(row('ip-bet-1-companies').bet_label).toBe('The Classic Post-Consulting Operator')
    expect(row('ip-bet-2-titles').values).toEqual(['Strategy Manager', 'Program Manager'])
    expect(row('ip-bet-2-titles').bet_label).toBe('The Scaled Startup BizOps Star')
  })
  it('a remote market has no location row; an empty brief has no rows', () => {
    expect(idealProfileFromBrief(brief, { ...market, work_model: 'remote' }).some((g) => g.kind === 'location')).toBe(false)
    expect(idealProfileFromBrief(null, null)).toEqual([])
  })
  it('degree_field evaluates against stored education', () => {
    const edu = by(IDEAL_PROFILE_IDS.education)
    expect(evaluateMustHaves([edu], {}, { education: [{ school: 'NIT Calicut', degree: 'B.Tech', field: 'Computer Science' }] })[0].pass).toBe(true)
    expect(evaluateMustHaves([edu], {}, { education: [{ school: 'Washington University', degree: 'BA', field: 'Entrepreneurship' }] })[0].pass).toBe(false)
    expect(evaluateMustHaves([edu], {}, {})[0].pass).toBeNull()
  })
})

import { unexpectedGateFailures, mustHavesFromSpec } from '@/lib/icp-gates'
describe('the ladder and the fold', () => {
  const relaxAt = { 'Roles held': 3, 'Companies': 2, 'Where': 4, 'Years': null }
  it('a person bought at L3 is expected to miss companies and titles, not years', () => {
    expect(unexpectedGateFailures(['Companies', 'Roles held', 'Years'], 3, relaxAt)).toEqual(['Years'])
    expect(unexpectedGateFailures(['Where'], 3, relaxAt)).toEqual(['Where'])
  })
  it('a pool-recall person (no level) counts every miss', () => {
    expect(unexpectedGateFailures(['Companies'], null, relaxAt)).toEqual(['Companies'])
  })
  it('an edited plan writes back its base line plus L1 relaxable rows, keeping screening gates', () => {
    const existing = [{ id: 's', label: 'Work authorization?', attribute: 'screening', operator: '', value: '' }]
    const spec = {
      base: [{ id: 'ip-years', kind: 'years_band' as const, values: [], min: 6, max: 12 }],
      levels: [{ criteria: [{ id: 'ip-titles', kind: 'title_any' as const, values: ['Engineering Manager'], relax_at: 3 }] }, { criteria: [{ id: 'ip-titles-l3', kind: 'title_any' as const, values: ['Staff Engineer'], relax_at: 3 }] }],
    }
    const out = mustHavesFromSpec(existing, spec)
    expect(out.map((g) => g.id)).toEqual(['ip-years', 'ip-titles', 's'])
  })
})


import { supersedeLegacyGates } from './gate-evaluator'

describe('supersedeLegacyGates — old questions never override the ideal profile', () => {
  // V6 of the Strategy & Operations Manager job, as stored.
  const profile = [
    mustHaveFromCriterion({ id: 'ip-years', kind: 'years_band', values: [], min: 2, max: 6 }),
    mustHaveFromCriterion({ id: 'ip-school', kind: 'school', values: ['IIT', 'IIM'], relax_at: 3 }),
    mustHaveFromCriterion({ id: 'ip-titles', kind: 'title_current', values: ['Strategy Manager'], relax_at: 3 }),
    mustHaveFromCriterion({ id: 'ip-companies', kind: 'employer_current', values: ['McKinsey'], relax_at: 2 }),
  ]
  const old = (id: string, label: string) => ({ id, label, attribute: '', operator: '', value: '' })
  const background = old('g-ai-0', "Is the candidate's core background in top-tier Management Consulting, IB/VC/PE, or Strategy/BizOps at a high-growth tech company?")
  const tier1 = old('g-ai-2', 'Is the candidate a graduate of a Tier-1 university (e.g., IIT, IIM A/B/C/L, ISB, BITS Pilani)?')
  const sql = old('g-ai-3', "Does the candidate's profile explicitly mention hands-on experience with SQL?")
  const ctx = { titleFamilies: ['Strategy Manager', 'Chief of Staff'] }

  it('an old question the profile covers becomes a screening note, not a hard rule', () => {
    const { gates, covered } = supersedeLegacyGates([...profile, background, tier1, sql], ctx)
    expect(covered.sort()).toEqual(['g-ai-0', 'g-ai-2'])
    for (const id of ['g-ai-0', 'g-ai-2']) {
      const g = gates.find((x) => x.id === id)!
      expect(g.attribute).toBe(SCREENING_ATTRIBUTE)
      expect(isCriterion(g)).toBe(false)
    }
    // The label survives, so snapshots keyed by it still line up.
    expect(gates.find((x) => x.id === 'g-ai-0')!.label).toBe(background.label)
  })
  it('the profile rows are untouched and nothing hard is added', () => {
    const { gates } = supersedeLegacyGates([...profile, background, tier1, sql], ctx)
    expect(gates.filter((g) => isCriterion(g)).map((g) => g.id)).toEqual(['ip-years', 'ip-school', 'ip-titles', 'ip-companies'])
  })
  it('an old question about something the profile does NOT cover still converts', () => {
    const noSchool = profile.filter((g) => g.kind !== 'school')
    const { gates, covered } = supersedeLegacyGates([...noSchool, tier1], ctx)
    expect(covered).toEqual([])
    expect(gates.find((g) => g.id === 'g-ai-2')?.kind).toBe('school')
  })
  it('a profile with no structured rows keeps the old conversion exactly', () => {
    expect(supersedeLegacyGates([background, tier1], ctx).gates).toEqual(convertLegacyGates([background, tier1], ctx))
  })
  it('an old years question beside a Years row counts as covered', () => {
    const years = old('g-band', 'Has between 2 and 6 years of professional experience?')
    expect(supersedeLegacyGates([...profile, years], ctx).covered).toEqual(['g-band'])
  })
})

import { organiseIntoBets } from './gate-evaluator'

describe('organiseIntoBets — upgrading a profile made before bets', () => {
  const brief = {
    market: 'Bengaluru', experience_band: { min_years: 2, max_years: 6 }, title_families: ['Strategy Manager'], adjacent_titles: [],
    current_functions: [], current_title_exclusions: [], market_gates: [], jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [], niche: '', persona: '',
    feeder_pools: [
      { label: 'Consulting', companies: ['McKinsey & Company', 'Bain & Company'], role_types: ['Associate', 'Consultant'], priority: 1 },
      { label: 'Startups', companies: ['Swiggy'], role_types: ['Strategy Manager'], priority: 2 },
    ],
  }
  const v6 = [
    mustHaveFromCriterion({ id: 'ip-years', kind: 'years_band', values: [], min: 2, max: 6 }),
    mustHaveFromCriterion({ id: 'ip-titles', kind: 'title_current', values: ['Strategy Manager'], relax_at: 3 }),
    // Edited on Scoring: Bain removed, Kearney added.
    mustHaveFromCriterion({ id: 'ip-companies', kind: 'employer_current', values: ['McKinsey', 'Kearney'], relax_at: 2 }),
    { id: 'g-sql', label: 'Mentions SQL?', attribute: '', operator: '', value: '' },
  ]
  const out = organiseIntoBets(v6, brief, { city: 'Bengaluru', country: 'IN', work_model: 'onsite' })!

  it('replaces the single title and company rows, and nothing else', () => {
    expect(out.replaces).toEqual(['ip-titles', 'ip-companies'])
  })
  it('bet 1 keeps the companies the profile has now; its titles are the pool\'s own', () => {
    const b1 = out.rows.filter((g) => g.bet === 1)
    expect(b1.find((g) => g.kind === 'employer_current')).toMatchObject({ values: ['McKinsey', 'Kearney'], label: 'Currently at: McKinsey / Kearney', enforcement: 'sourcing_only' })
    expect(b1.find((g) => g.kind === 'title_current')?.values).toEqual(['Associate', 'Consultant'])
  })
  it('later bets come from the brief', () => {
    expect(out.rows.filter((g) => g.bet === 2).map((g) => g.values)).toEqual([['Swiggy'], ['Strategy Manager']])
  })
  it('offers nothing for a profile already in bets, or one with no profile', () => {
    expect(organiseIntoBets([...v6, ...out.rows], brief, null)).toBeNull()
    expect(organiseIntoBets([v6[3]], brief, null)).toBeNull()
  })
})
