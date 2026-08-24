import { describe, it, expect } from 'vitest'
import { RULE_FIELDS, ruleField, operatorsForField, isValidCondition, describeCondition } from './rule-fields'

describe('rule fields', () => {
  it('every field has valid operators for its type', () => {
    for (const f of RULE_FIELDS) {
      expect(operatorsForField(f.field).length).toBeGreaterThan(0)
    }
    expect(ruleField('days_in_stage')?.type).toBe('number')
    expect(ruleField('fit_bucket')?.options?.length).toBe(4)
    expect(ruleField('nonexistent')).toBeUndefined()
  })

  describe('isValidCondition', () => {
    it('accepts a well-formed number condition', () => {
      expect(isValidCondition('days_in_stage', 'gt', 3)).toBe(true)
      expect(isValidCondition('ai_score', 'gte', 70)).toBe(true)
    })
    it('rejects a number condition with a non-number or wrong operator', () => {
      expect(isValidCondition('days_in_stage', 'gt', 'three')).toBe(false)
      expect(isValidCondition('days_in_stage', 'is', 3)).toBe(false)
    })
    it('validates choice values against the option list', () => {
      expect(isValidCondition('review_status', 'is', 'no')).toBe(true)
      expect(isValidCondition('review_status', 'is', 'banana')).toBe(false)
      expect(isValidCondition('fit_bucket', 'is_not', 'weak')).toBe(true)
    })
    it('accepts boolean conditions with no value', () => {
      expect(isValidCondition('has_feedback', 'is_true', undefined)).toBe(true)
      expect(isValidCondition('missing_must_have', 'is_false', undefined)).toBe(true)
    })
    it('rejects unknown fields', () => {
      expect(isValidCondition('salary', 'gt', 5)).toBe(false)
    })
  })

  describe('describeCondition', () => {
    it('renders readable text for each field type', () => {
      expect(describeCondition('days_in_stage', 'gt', 3)).toBe('Days in stage greater than 3 days')
      expect(describeCondition('ai_score', 'gte', 70)).toBe('Fit score at least 70')
      expect(describeCondition('review_status', 'is', 'no')).toBe('Recruiter decision is No')
      expect(describeCondition('has_feedback', 'is_true', undefined)).toBe('Interview feedback submitted is yes')
    })
  })

  describe('lead-funnel outreach fields', () => {
    it('exposes enrolled + replied as boolean fields', () => {
      expect(ruleField('enrolled')?.type).toBe('boolean')
      expect(ruleField('replied')?.type).toBe('boolean')
      expect(isValidCondition('enrolled', 'is_false', undefined)).toBe(true)
      expect(isValidCondition('replied', 'is_true', undefined)).toBe(true)
    })
    it('renders readable outreach conditions', () => {
      expect(describeCondition('enrolled', 'is_false', undefined)).toBe('Added to a sequence is no')
      expect(describeCondition('replied', 'is_true', undefined)).toBe('Replied to outreach is yes')
    })
  })

  describe('AI phone-screen fields', () => {
    it('exposes has_ai_call (boolean) + ai_call_score (number)', () => {
      expect(ruleField('has_ai_call')?.type).toBe('boolean')
      expect(ruleField('ai_call_score')?.type).toBe('number')
      expect(isValidCondition('has_ai_call', 'is_true', undefined)).toBe(true)
      expect(isValidCondition('ai_call_score', 'gte', 70)).toBe(true)
    })
    it('renders readable AI-call conditions', () => {
      expect(describeCondition('has_ai_call', 'is_true', undefined)).toBe('AI call completed is yes')
      expect(describeCondition('ai_call_score', 'gte', 70)).toBe('AI call score at least 70')
    })
  })
})
