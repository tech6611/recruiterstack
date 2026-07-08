import { describe, it, expect } from 'vitest'
import { matchTagRules, matchStageRules, matchStatusRules, matchAppliedRules, type EnrollmentRule } from '../automations'

const rule = (over: Partial<EnrollmentRule>): EnrollmentRule => ({
  id: 'r', org_id: 'org1', name: '', enabled: true,
  trigger_type: 'tag_added', trigger_value: 'lead', sequence_id: 's1', ...over,
})

describe('matchTagRules', () => {
  const rules = [
    rule({ id: 'a', trigger_type: 'tag_added', trigger_value: 'lead' }),
    rule({ id: 'b', trigger_type: 'tag_added', trigger_value: 'other' }),
    rule({ id: 'c', trigger_type: 'stage_moved', trigger_value: 'lead' }),
    rule({ id: 'd', trigger_type: 'tag_added', trigger_value: 'lead', org_id: 'org2' }),
    rule({ id: 'e', trigger_type: 'tag_added', trigger_value: 'lead', enabled: false }),
  ]

  it('matches only enabled tag rules for the same org + tag', () => {
    expect(matchTagRules(rules, 'org1', 'lead').map(r => r.id)).toEqual(['a'])
  })
  it('does not match a different tag', () => {
    expect(matchTagRules(rules, 'org1', 'nope')).toEqual([])
  })
  it('scopes by org', () => {
    expect(matchTagRules(rules, 'org2', 'lead').map(r => r.id)).toEqual(['d'])
  })
  it('ignores stage rules', () => {
    expect(matchTagRules(rules, 'org1', 'lead').every(r => r.trigger_type === 'tag_added')).toBe(true)
  })
})

describe('matchStageRules', () => {
  const rules = [
    rule({ id: 'a', trigger_type: 'stage_moved', trigger_value: 'Screening' }),
    rule({ id: 'b', trigger_type: 'tag_added', trigger_value: 'Screening' }),
    rule({ id: 'c', trigger_type: 'stage_moved', trigger_value: 'Offer' }),
    rule({ id: 'd', trigger_type: 'stage_moved', trigger_value: 'Screening', enabled: false }),
  ]

  it('matches only enabled stage rules for the same org + destination stage', () => {
    expect(matchStageRules(rules, 'org1', 'Screening').map(r => r.id)).toEqual(['a'])
  })
  it('does not match a different stage', () => {
    expect(matchStageRules(rules, 'org1', 'Hired')).toEqual([])
  })
  it('ignores tag rules', () => {
    expect(matchStageRules(rules, 'org1', 'Screening').every(r => r.trigger_type === 'stage_moved')).toBe(true)
  })
})

describe('matchStatusRules', () => {
  const rules = [
    rule({ id: 'a', trigger_type: 'status_changed', trigger_value: 'rejected' }),
    rule({ id: 'b', trigger_type: 'status_changed', trigger_value: 'hired' }),
    rule({ id: 'c', trigger_type: 'stage_moved', trigger_value: 'rejected' }),
    rule({ id: 'd', trigger_type: 'status_changed', trigger_value: 'rejected', enabled: false }),
  ]
  it('matches enabled status rules by the new status', () => {
    expect(matchStatusRules(rules, 'org1', 'rejected').map(r => r.id)).toEqual(['a'])
  })
  it('does not match a different status or type', () => {
    expect(matchStatusRules(rules, 'org1', 'withdrawn')).toEqual([])
  })
})

describe('matchAppliedRules', () => {
  const rules = [
    rule({ id: 'a', trigger_type: 'applied', trigger_value: 'any' }),
    rule({ id: 'b', trigger_type: 'applied', trigger_value: 'ignored-too', org_id: 'org1' }),
    rule({ id: 'c', trigger_type: 'stage_moved', trigger_value: 'Applied' }),
    rule({ id: 'd', trigger_type: 'applied', trigger_value: 'any', org_id: 'org2' }),
    rule({ id: 'e', trigger_type: 'applied', trigger_value: 'any', enabled: false }),
  ]
  it('matches all enabled applied rules for the org, ignoring value', () => {
    expect(matchAppliedRules(rules, 'org1').map(r => r.id)).toEqual(['a', 'b'])
  })
  it('scopes by org and skips disabled', () => {
    expect(matchAppliedRules(rules, 'org2').map(r => r.id)).toEqual(['d'])
  })
})
