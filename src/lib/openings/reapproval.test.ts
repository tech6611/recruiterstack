import { describe, it, expect } from 'vitest'
import { diffOpeningPatch, splitByGate, changesToPatch, DEFAULT_OPENING_REAPPROVAL_FIELDS, changesToMaps, mapsToChanges } from './reapproval'

const current = {
  id: 'o1', title: 'Eng Manager', department_id: 'd1', comp_min: '100000.00', comp_max: '150000.00', comp_currency: 'USD',
  target_start_date: '2026-10-01', hiring_manager_id: 'u1', justification: 'because', status: 'approved',
  custom_fields: { cost_center: 'CC-1', level: 'L5' },
}

describe('diffOpeningPatch', () => {
  it('reports only real changes, ignoring numeric-string vs number and blank vs null', () => {
    const d = diffOpeningPatch(current, { comp_min: 100000, comp_max: 160000, title: 'Eng Manager', justification: '', status: 'draft' })
    expect(d).toEqual([
      { field: 'comp_max', before: 150000, after: 160000 },
      { field: 'justification', before: 'because', after: null },
    ])
  })
  it('diffs custom fields per key', () => {
    const d = diffOpeningPatch(current, { custom_fields: { cost_center: 'CC-2', level: 'L5', new_key: 'x' } })
    expect(d.map(c => c.field)).toEqual(['custom_fields.cost_center', 'custom_fields.new_key'])
  })
})

describe('splitByGate', () => {
  it('separates gated from immediate using the default set', () => {
    const changes = diffOpeningPatch(current, { comp_max: 160000, title: 'Senior EM', hiring_manager_id: 'u2' })
    const { immediate, gated } = splitByGate(changes, DEFAULT_OPENING_REAPPROVAL_FIELDS)
    expect(gated.map(c => c.field)).toEqual(['comp_max'])
    expect(immediate.map(c => c.field)).toEqual(['title', 'hiring_manager_id'])   // HM not gated by default
  })
  it('gates custom fields flagged require_reapproval', () => {
    const changes = diffOpeningPatch(current, { custom_fields: { cost_center: 'CC-2' } })
    const { gated } = splitByGate(changes, ['custom_fields.cost_center'])
    expect(gated).toHaveLength(1)
  })
})

describe('changesToPatch / maps round-trip', () => {
  it('rebuilds a DB patch with custom_fields merged onto current', () => {
    const changes = diffOpeningPatch(current, { comp_max: 160000, custom_fields: { cost_center: 'CC-2' } })
    expect(changesToPatch(changes, current)).toEqual({ comp_max: 160000, custom_fields: { cost_center: 'CC-2', level: 'L5' } })
  })
  it('round-trips through previous/proposed maps', () => {
    const changes = diffOpeningPatch(current, { comp_max: 160000, title: 'X' })
    const { previous, proposed } = changesToMaps(changes)
    expect(mapsToChanges(previous, proposed)).toEqual(changes)
  })
})
