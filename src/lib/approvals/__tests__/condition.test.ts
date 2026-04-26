import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../condition'

describe('evaluateCondition', () => {
  const target = {
    comp_max: 250000,
    department_id: 'dept-eng',
    location: { country: 'US', city: 'SF' },
    custom_fields: { seniority_level: 'staff' },
    skills: ['Go', 'Postgres'],
  }

  it('returns true for null condition', () => {
    expect(evaluateCondition(null, target)).toBe(true)
    expect(evaluateCondition(undefined, target)).toBe(true)
  })

  it('eq / neq leaf', () => {
    expect(evaluateCondition({ field: 'department_id', op: 'eq', value: 'dept-eng' }, target)).toBe(true)
    expect(evaluateCondition({ field: 'department_id', op: 'neq', value: 'dept-eng' }, target)).toBe(false)
  })

  it('numeric comparisons coerce string and number', () => {
    expect(evaluateCondition({ field: 'comp_max', op: 'gt',  value: 200000 }, target)).toBe(true)
    expect(evaluateCondition({ field: 'comp_max', op: 'lt',  value: 200000 }, target)).toBe(false)
    expect(evaluateCondition({ field: 'comp_max', op: 'gte', value: 250000 }, target)).toBe(true)
  })

  it('dot-notation field path', () => {
    expect(evaluateCondition({ field: 'location.country', op: 'eq', value: 'US' }, target)).toBe(true)
    expect(evaluateCondition({ field: 'custom_fields.seniority_level', op: 'eq', value: 'staff' }, target)).toBe(true)
  })

  it('contains works on arrays', () => {
    expect(evaluateCondition({ field: 'skills', op: 'contains', value: 'Go' }, target)).toBe(true)
    expect(evaluateCondition({ field: 'skills', op: 'contains', value: 'Java' }, target)).toBe(false)
  })

  it('all + any nest correctly', () => {
    const cond = {
      all: [
        { field: 'comp_max', op: 'gt' as const, value: 200000 },
        { any: [
          { field: 'location.country', op: 'eq' as const, value: 'US' },
          { field: 'location.country', op: 'eq' as const, value: 'CA' },
        ]},
      ],
    }
    expect(evaluateCondition(cond, target)).toBe(true)
  })

  it('not negates', () => {
    expect(evaluateCondition({ not: { field: 'comp_max', op: 'gt', value: 100000 } }, target)).toBe(false)
  })

  it('exists checks presence', () => {
    expect(evaluateCondition({ field: 'department_id', op: 'exists' }, target)).toBe(true)
    expect(evaluateCondition({ field: 'nonexistent', op: 'exists' }, target)).toBe(false)
  })
})
