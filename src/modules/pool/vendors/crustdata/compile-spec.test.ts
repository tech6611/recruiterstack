import { describe, it, expect } from 'vitest'
import { compileCriterion, compileSpec } from './compile-spec'
import type { SearchSpec } from '@/lib/types/search-spec'

describe('compileCriterion', () => {
  it('maps each kind to the verified Crustdata field and grammar', () => {
    const cur = compileCriterion({ id: 'a', kind: 'employer_current', values: ['McKinsey', 'BCG'] })
    expect(cur).toMatchObject({ ok: { conditions: [{ op: 'or', conditions: [{ field: 'experience.employment_details.current.company_name', type: '(.)', value: 'McKinsey' }, { field: 'experience.employment_details.current.company_name', type: '(.)', value: 'BCG' }] }] } })
    expect(compileCriterion({ id: 'b', kind: 'employer_past', values: ['Bain'] })).toMatchObject({ ok: { conditions: [{ conditions: [{ field: 'experience.employment_details.past.company_name' }] }] } })
    expect(compileCriterion({ id: 'c', kind: 'school', values: ['Indian Institute of Technology'] })).toMatchObject({ ok: { conditions: [{ conditions: [{ field: 'education.schools.school', type: '(.)' }] }], summary: 'school: Indian Institute of Technology' } })
    expect(compileCriterion({ id: 'd', kind: 'seniority', values: ['Director', 'VP'], exclude: true })).toMatchObject({ ok: { conditions: [{ field: 'experience.employment_details.current.seniority_level', type: 'not_in', value: ['Director', 'Vice President'] }] } })
    expect(compileCriterion({ id: 'e', kind: 'years_band', values: [], min: 2, max: 6 })).toMatchObject({ ok: { conditions: [{ field: 'years_of_experience_raw', type: '=>', value: 2 }, { field: 'years_of_experience_raw', type: '=<', value: 6 }], summary: '2–6 years' } })
    expect(compileCriterion({ id: 'f', kind: 'location', values: ['Bengaluru, Karnataka, India'], radius_km: 50 })).toMatchObject({ ok: { conditions: [{ type: 'geo_distance', value: { location: 'Bengaluru, Karnataka, India', distance: 50, unit: 'km' } }] } })
    expect(compileCriterion({ id: 'g', kind: 'grad_year_band', values: [], min: 2019, max: 2023 })).toMatchObject({ ok: { conditions: [{ field: 'education.schools.end_year', type: '=>', value: 2019 }, { field: 'education.schools.end_year', type: '=<', value: 2023 }] } })
  })
  it('reports what this source cannot express instead of guessing', () => {
    expect(compileCriterion({ id: 'h', kind: 'industry', values: ['fintech'] })).toHaveProperty('unsupported')
    expect(compileCriterion({ id: 'i', kind: 'seniority', values: ['wizard'] })).toHaveProperty('unsupported')
    expect(compileCriterion({ id: 'j', kind: 'school', values: [] })).toHaveProperty('unsupported')
  })
})

describe('compileSpec', () => {
  const spec: SearchSpec = {
    version: 1,
    base: [
      { id: 'loc', kind: 'location', values: ['Bengaluru, Karnataka, India'], radius_km: 50 },
      { id: 'yrs', kind: 'years_band', values: [], min: 2, max: 6 },
      { id: 'ind', kind: 'industry', values: ['SaaS'] },
    ],
    levels: [
      { id: 'L1', label: 'Tier-1 · currently at MBB', criteria: [{ id: 's', kind: 'school', values: ['IIT'] }, { id: 'e', kind: 'employer_current', values: ['McKinsey'] }] },
      { id: 'L2', label: 'Unsearchable level', criteria: [{ id: 'x', kind: 'company_size', values: ['1-50'] }] },
      { id: 'L3', label: 'Titles', criteria: [{ id: 't', kind: 'title_current', values: ['Chief of Staff'] }], relaxes: 'title only' },
    ],
    post_fetch: [{ label: 'Mentions SQL', how: 'judge' }, { label: 'Consulting tenure', how: 'local' }],
    source: 'brief',
  }
  const out = compileSpec(spec)

  it('every lane carries the base conditions; unsearchable levels are skipped and reported', () => {
    expect(out.lanes.map((l) => l.label)).toEqual(['Tier-1 · currently at MBB', 'Titles'])
    for (const l of out.lanes) {
      const conds = l.filters.conditions as { type?: string; field?: string }[]
      expect(conds.some((c) => c.type === 'geo_distance')).toBe(true)
      expect(conds.filter((c) => c.field === 'years_of_experience_raw')).toHaveLength(2)
    }
    expect(out.unsupported.map((u) => u.level)).toEqual(['base', 'Unsearchable level'])
    expect(out.lanes[1].rationale).toBe('Relaxes: title only')
  })

  it('lane keys are stable, kind is "level", and post-fetch checks appear in unmapped with honest reasons', () => {
    expect(out.lanes[0].key).toMatch(/^L1:tier-1-currently-at-mbb:[a-z0-9]+$/)
    expect(out.lanes.every((l) => l.kind === 'level')).toBe(true)
    expect(out.unmapped.map((u) => u.reason)).toEqual(expect.arrayContaining(['judged by the Fit Engine after fetch', 'computed from stored role history after fetch']))
    expect(compileSpec(spec).lanes.map((l) => l.key)).toEqual(out.lanes.map((l) => l.key))
  })
})
