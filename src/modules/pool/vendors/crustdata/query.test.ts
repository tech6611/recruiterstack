import { describe, it, expect } from 'vitest'
import { buildCrustdataQueryFromIcp, isQueryable } from './query'
import type { CrustdataCondition } from './query'
import type { IcpMustHave } from '@/lib/types/icp'

const mh = (attribute: string, operator: string, value: IcpMustHave['value'], label = ''): IcpMustHave => ({
  id: `${attribute}-${String(value)}`,
  label: label || `${attribute} ${operator} ${String(value)}`,
  attribute,
  operator,
  value,
})

const byField = (build: ReturnType<typeof buildCrustdataQueryFromIcp>): Record<string, CrustdataCondition> =>
  Object.fromEntries(build.filters.conditions.map((c) => [(c as CrustdataCondition).field, c as CrustdataCondition]))

describe('buildCrustdataQueryFromIcp — structured must-haves', () => {
  it('maps min-experience gte to the numeric =>  operator (not >=)', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('min_experience', 'gte', 5)] })
    expect(b.filters.conditions).toContainEqual({ field: 'years_of_experience_raw', type: '=>', value: 5 })
  })

  it('maps a location gate to geo_distance with the default 50km radius', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('location', 'equals', 'Bengaluru, India')] })
    expect(byField(b)['professional_network.location.raw']).toEqual({
      field: 'professional_network.location.raw',
      type: 'geo_distance',
      value: { location: 'Bengaluru, India', distance: 50, unit: 'km' },
    })
  })

  it('honours a custom location radius', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('location', 'equals', 'Pune')] }, { locationRadiusKm: 25 })
    expect((byField(b)['professional_network.location.raw'].value as { distance: number }).distance).toBe(25)
  })

  it('maps skills (one_of / array) to an `in` condition', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('skill', 'one_of', ['Python', 'Go'])] })
    expect(byField(b)['skills.professional_network_skills']).toEqual({
      field: 'skills.professional_network_skills',
      type: 'in',
      value: ['Python', 'Go'],
    })
  })

  it('wraps a single skill string into an array', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('skills', 'includes', 'Kubernetes')] })
    expect(byField(b)['skills.professional_network_skills'].value).toEqual(['Kubernetes'])
  })
})

describe('buildCrustdataQueryFromIcp — closed value sets', () => {
  it('normalizes seniority aliases to Crustdata\'s exact values', () => {
    const b = buildCrustdataQueryFromIcp({
      must_haves: [mh('seniority', 'one_of', ['sr', 'VP', 'Director'])],
    })
    expect((byField(b)['experience.employment_details.current.seniority_level'].value as string[]).sort()).toEqual(
      ['Director', 'Senior', 'Vice President'],
    )
  })

  it('normalizes function aliases and drops unknowns, recording them', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('function', 'equals', 'eng')] })
    expect(byField(b)['experience.employment_details.current.function_category'].value).toEqual(['Engineering'])
  })

  it('marks a seniority value outside the closed set as unmapped, not a broken filter', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('seniority', 'equals', 'Wizard')] })
    expect(b.filters.conditions).toHaveLength(0)
    expect(b.unmapped[0].reason).toMatch(/closed set/)
  })
})

describe('buildCrustdataQueryFromIcp — title handling', () => {
  it('adds the job title from context as an all-words match when no must-have supplies one', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('min_experience', 'gte', 3)] }, { title: 'Backend Engineer' })
    // Title is prepended.
    expect(b.filters.conditions[0]).toEqual({
      field: 'experience.employment_details.current.title',
      type: '(.)',
      value: 'Backend Engineer',
    })
  })

  it('does not duplicate the title when a must-have already provides one', () => {
    const b = buildCrustdataQueryFromIcp(
      { must_haves: [mh('title', 'equals', 'Staff Engineer')] },
      { title: 'Backend Engineer' },
    )
    const titles = b.filters.conditions.filter(
      (c) => (c as CrustdataCondition).field === 'experience.employment_details.current.title',
    )
    expect(titles).toHaveLength(1)
    expect((titles[0] as CrustdataCondition).value).toBe('Staff Engineer')
  })
})

describe('buildCrustdataQueryFromIcp — unmapped + queryable', () => {
  it('records a genuinely unknown attribute as unmapped and never throws', () => {
    const b = buildCrustdataQueryFromIcp({ must_haves: [mh('security_clearance', 'equals', 'top secret')] })
    expect(b.filters.conditions).toHaveLength(0)
    expect(b.unmapped[0]).toMatchObject({ reason: expect.stringContaining('no Crustdata search field') })
    expect(isQueryable(b)).toBe(false)
  })

  it('routes fuzzy attributes (industry, background, culture) to ranking, not a hard filter', () => {
    for (const attr of ['industry', 'background', 'culture_fit']) {
      const b = buildCrustdataQueryFromIcp({ must_haves: [mh(attr, 'includes_any', ['b2b saas'])] })
      expect(b.filters.conditions).toHaveLength(0)
      expect(b.unmapped[0].reason).toMatch(/post-fetch ranking signal/)
    }
  })

  it('produces a full AND group for a realistic ICP', () => {
    const b = buildCrustdataQueryFromIcp(
      {
        must_haves: [
          mh('min_experience', 'gte', 5, '5+ years'),
          mh('location', 'equals', 'Bengaluru, India', 'Based in Bangalore'),
          mh('seniority', 'one_of', ['senior'], 'Senior level'),
          mh('culture', 'equals', 'startup', 'Startup DNA'),
        ],
      },
      { title: 'Backend Engineer' },
    )
    expect(b.filters.op).toBe('and')
    expect(b.filters.conditions).toHaveLength(4) // title + 3 mapped must-haves
    expect(b.mapped).toHaveLength(4)
    expect(b.unmapped).toHaveLength(1) // "culture" has no field
    expect(isQueryable(b)).toBe(true)
  })
})
