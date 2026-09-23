import { describe, it, expect } from 'vitest'
import { mergeEnrichment, normalizeWeights, buildIcpFromGeneration, isDefaultRubric, type IcpEnrichment } from './icp-generator'
import { DEFAULT_SCORING_CRITERIA } from '@/lib/scoring'
import type { IcpDraftInput } from '@/lib/types/icp'
import type { HiringRequest } from '@/lib/types/database'

const seed: IcpDraftInput = {
  source: 'seed',
  must_haves: [
    { id: 'location', label: 'Based in Bengaluru', attribute: 'location', operator: 'equals', value: 'Bengaluru' },
  ],
  competencies: [
    { id: 'technical', name: 'Technical Skills', weight: 35, behaviours: [] },
    { id: 'culture', name: 'Culture Fit', weight: 20, behaviours: [] },
  ],
}

describe('mergeEnrichment', () => {
  it('attaches behaviours/anchors/verbatim by id while preserving weights and names', () => {
    const enrichment: IcpEnrichment = {
      must_haves: [],
      competencies: [
        {
          id: 'technical',
          behaviours: ['ships without hand-holding', 'owns a service end to end'],
          anchors: { '1': 'a', '2': 'b', '3': 'c', '4': 'd' },
          verbatim: 'must be able to de-risk a launch',
        },
      ],
    }
    const out = mergeEnrichment(seed, enrichment)
    const tech = out.competencies.find((c) => c.id === 'technical')!
    expect(tech).toMatchObject({ name: 'Technical Skills', weight: 35 }) // untouched
    expect(tech.behaviours).toEqual(['ships without hand-holding', 'owns a service end to end'])
    expect(tech.anchors).toEqual({ '1': 'a', '2': 'b', '3': 'c', '4': 'd' })
    expect(tech.verbatim).toBe('must be able to de-risk a launch')
    // source flips to 'intake' (LLM-enriched)
    expect(out.source).toBe('intake')
  })

  it('leaves competencies without a matching enrichment id unchanged', () => {
    const out = mergeEnrichment(seed, { must_haves: [], competencies: [{ id: 'technical', behaviours: ['x'] }] })
    const culture = out.competencies.find((c) => c.id === 'culture')!
    expect(culture.behaviours).toEqual([]) // no enrichment for 'culture'
  })

  it('caps behaviours at 6 and drops empties', () => {
    const enrichment: IcpEnrichment = {
      must_haves: [],
      competencies: [{ id: 'technical', behaviours: ['a', '', '  ', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    }
    const tech = mergeEnrichment(seed, enrichment).competencies.find((c) => c.id === 'technical')!
    expect(tech.behaviours).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('keeps seed gates first and appends only novel model gates, de-duped', () => {
    const enrichment: IcpEnrichment = {
      must_haves: [
        // duplicate of the seed location gate (different casing) — should drop
        { label: 'Bengaluru', attribute: 'location', operator: 'equals', value: 'bengaluru' },
        // novel gate — should be kept and get an id
        { label: '5+ years', attribute: 'min_experience', operator: 'gte', value: '5' },
      ],
      competencies: [],
    }
    const out = mergeEnrichment(seed, enrichment)
    expect(out.must_haves.map((g) => g.attribute)).toEqual(['location', 'min_experience'])
    expect(out.must_haves[1].id).toMatch(/^g-ai-/)
  })
})

describe('normalizeWeights', () => {
  it('rescales arbitrary weights to sum exactly 100', () => {
    expect(normalizeWeights([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
    expect(normalizeWeights([30, 30, 30]).reduce((a, b) => a + b, 0)).toBe(100)
    expect(normalizeWeights([50, 25, 25])).toEqual([50, 25, 25])
  })
  it('handles empty / zero input without NaN', () => {
    expect(normalizeWeights([])).toEqual([])
    expect(normalizeWeights([0, 0]).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('buildIcpFromGeneration', () => {
  const job = { position_title: 'Payments Engineer', level: 'senior', location: 'Bengaluru', remote_ok: false } as unknown as HiringRequest

  it('derives role-specific competencies with slugged ids and weights summing to 100', () => {
    const out = buildIcpFromGeneration(job, {
      competencies: [
        { name: 'Payments domain depth', weight: 40, behaviours: ['designs ledgers'] },
        { name: 'Systems reliability', weight: 35, behaviours: [] },
        { name: 'Communication', weight: 25, behaviours: [] },
      ],
      must_haves: [{ label: '5+ yrs payments', attribute: 'min_experience', operator: 'gte', value: '5' }],
    })
    expect(out.competencies.map((c) => c.id)).toContain('payments-domain-depth')
    expect(out.competencies.reduce((s, c) => s + c.weight, 0)).toBe(100)
    // No auto-seeded location/seniority gates anymore — only the model's own
    // deal-breakers survive (a good recruiter never rejects on location).
    expect(out.must_haves.some((g) => g.attribute === 'location')).toBe(false)
    expect(out.must_haves.some((g) => g.attribute === 'min_experience')).toBe(true)
  })

  it('makes duplicate competency names unique', () => {
    const out = buildIcpFromGeneration(job, {
      competencies: [
        { name: 'Depth', weight: 50, behaviours: [] },
        { name: 'Depth', weight: 50, behaviours: [] },
      ],
      must_haves: [],
    })
    const ids = out.competencies.map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('isDefaultRubric', () => {
  it('treats empty / null as default', () => {
    expect(isDefaultRubric(null)).toBe(true)
    expect(isDefaultRubric([])).toBe(true)
  })
  it('treats the default four (even reweighted) as default', () => {
    expect(isDefaultRubric(DEFAULT_SCORING_CRITERIA)).toBe(true)
    // reweighted defaults (the exact bug case: 45/10/15/30) still = default
    expect(isDefaultRubric(DEFAULT_SCORING_CRITERIA.map((c, i) => ({ ...c, weight: [45, 10, 15, 30][i] })))).toBe(true)
  })
  it('treats a genuinely curated rubric as custom', () => {
    expect(isDefaultRubric([
      { id: 'payments-depth', name: 'Payments depth', weight: 50, description: '' },
      { id: 'reliability', name: 'Reliability', weight: 50, description: '' },
    ])).toBe(false)
    // defaults + an extra competency = curated
    expect(isDefaultRubric([...DEFAULT_SCORING_CRITERIA, { id: 'leadership', name: 'Leadership', weight: 0, description: '' }])).toBe(false)
  })
})

// ── Phase 1: niche recruiter brief ───────────────────────────────────────────────
import { buildChallengerReasoningPrompt, buildReasoningFirstPrompt, sourcingMapFromReasoning, type ReasoningFirstGeneration } from './icp-generator'

const stratJob = {
  position_title: 'Strategy & Operations Manager', level: 'Senior', location: 'Bangalore Back Office', remote_ok: false,
  key_requirements: '- At least a 2:1 degree\n- SQL, Python, or R', nice_to_haves: null, team_context: null,
  target_companies: 'Google', generated_jd: 'Operations means problem-solving at scale.',
} as unknown as HiringRequest

describe('buildReasoningFirstPrompt (niche recruiter, Phase 1)', () => {
  it('feeds the hiring company and market, and asks for the recruiter brief FIRST', () => {
    const prompt = buildReasoningFirstPrompt(stratJob, null, {
      roleContext: {
        market: { site: 'Bangalore Back Office', city: 'Bengaluru', state: 'Karnataka', country: 'IN', timezone: 'IST', work_model: 'onsite' },
        company: { name: 'RecruiterStack', industry: 'SaaS', size: '11-50', website: null, about: 'An ATS.' },
      },
    })
    expect(prompt).toContain('<hiring_company>\nName: RecruiterStack\nIndustry: SaaS\nSize: 11-50 employees\nAbout: An ATS.\n</hiring_company>')
    expect(prompt).toContain('<market>\nLocation: Bengaluru, Karnataka, IN (site: Bangalore Back Office)\nWork model: onsite\nTimezone: IST\n</market>')
    expect(prompt.indexOf('0) recruiter_brief')).toBeLessThan(prompt.indexOf('1) reasoning'))
    expect(prompt).toContain('"recruiter_brief"')
    // The shared prompt no longer reasons like a tech recruiter by default.
    expect(prompt).not.toContain('software-engineering background')
    expect(prompt).not.toContain('product-vs-services')
    expect(prompt).not.toContain('<recruiter_corrections>')
  })

  it('renders "Not provided" without context and injects recruiter corrections when present', () => {
    const prompt = buildReasoningFirstPrompt(stratJob, null, { recruiterCorrections: 'Also search IB analysts at Avendus.' })
    expect(prompt).toContain('<hiring_company>\nNot provided\n</hiring_company>')
    expect(prompt).toContain('<market>\nNot provided\n</market>')
    expect(prompt).toContain('<recruiter_corrections>\nAlso search IB analysts at Avendus.\n</recruiter_corrections>')
    expect(prompt).toContain('THEY WIN')
  })

  it('keeps the shared response contract while adding the challenger evidence rules', () => {
    const prompt = buildChallengerReasoningPrompt(stratJob)
    expect(prompt).toContain('"recruiter_brief"')
    expect(prompt).toContain('"must_haves": []')
    expect(prompt).toContain('Build the acquisition strategy from the work this hire must personally do')
    expect(prompt).toContain('Company size is not company stage')
    expect(prompt).toContain('A company name is evidence of possible exposure')
  })
})

describe('sourcingMapFromReasoning', () => {
  const gen: ReasoningFirstGeneration = {
    recruiter_brief: {
      niche: 'Strategy & Ops recruiter, Bengaluru', persona: 'p', market: 'Bengaluru, on-site',
      feeder_pools: [{ label: 'MBB', companies: ['McKinsey'], role_types: ['Consultant'], priority: 1, rationale: null }],
      title_families: ['BizOps'], market_gates: [], jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [],
    },
    reasoning: 'r', requirement_decomposition: [], unwritten_filters: [], archetypes: [],
    competencies: [{ name: 'A', weight: 100, behaviours: [] }], must_haves: [],
  }
  it('stores the brief and carries the recruiter corrections on it', () => {
    const sm = sourcingMapFromReasoning(gen, '  Prefer ISB grads. ')
    expect(sm.recruiter_brief?.niche).toBe('Strategy & Ops recruiter, Bengaluru')
    expect(sm.recruiter_brief?.feeder_pools[0].companies).toEqual(['McKinsey'])
    expect(sm.recruiter_brief?.corrections).toBe('Prefer ISB grads.')
  })
  it('keeps corrections even when the model returned no brief; null brief otherwise', () => {
    expect(sourcingMapFromReasoning({ ...gen, recruiter_brief: null }, 'x').recruiter_brief?.corrections).toBe('x')
    expect(sourcingMapFromReasoning({ ...gen, recruiter_brief: null }, null).recruiter_brief).toBeNull()
  })
})

// ── Experience band → one structured gate ─────────────────────────────────────
import { draftFromReasoning } from './icp-generator'

describe('draftFromReasoning — the must-haves ARE the ideal profile', () => {
  const base: ReasoningFirstGeneration = {
    recruiter_brief: {
      niche: 'n', persona: 'p', market: 'm', experience_band: { min_years: 2, max_years: 6, rationale: 'IC seat' },
      feeder_pools: [{ label: 'Consulting', companies: ['McKinsey & Company', 'Bain'], role_types: [], priority: 1 }],
      title_families: ['Chief of Staff', 'Strategy Manager'], adjacent_titles: ['Business Operations Manager'],
      education: { degrees: ['MBA'], fields: [] },
      market_gates: [], jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [],
    },
    reasoning: '', requirement_decomposition: [], unwritten_filters: [], archetypes: [],
    competencies: [{ name: 'A', weight: 100, behaviours: [] }],
    must_haves: [{ label: 'Has at least 2 full years of experience?' }, { label: 'Mentions SQL?' }],
  }
  it('builds where · years · education · roles held · companies from the brief and ignores yes/no gates', () => {
    const d = draftFromReasoning(base, { city: 'Bengaluru', state: 'Karnataka', country: 'IN', work_model: 'onsite' })
    expect(d.must_haves.map((g) => g.kind)).toEqual(['location', 'years_band', 'degree_field', 'title_any', 'employer_current'])
    expect(d.must_haves.find((g) => g.kind === 'years_band')).toMatchObject({ min: 2, max: 6 })
    expect(d.must_haves.find((g) => g.kind === 'employer_current')?.values).toEqual(['McKinsey', 'Bain'])
    expect(d.must_haves.some((g) => /SQL/.test(g.label))).toBe(false)
  })
  it('with no market and no brief there is simply no profile — never a question gate', () => {
    const d = draftFromReasoning({ ...base, recruiter_brief: null })
    expect(d.must_haves).toEqual([])
    expect(d.competencies).toHaveLength(1)
  })
})
