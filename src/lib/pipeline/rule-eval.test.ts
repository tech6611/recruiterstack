import { describe, it, expect } from 'vitest'
import { compareCondition, evaluateConditions, type RuleFacts } from './rule-eval'
import type { RuleCondition } from '@/lib/types/pipeline-automations'

const c = (field: string, operator: string, value?: string | number): RuleCondition =>
  ({ field, operator, value } as RuleCondition)

describe('compareCondition', () => {
  it('handles numeric operators', () => {
    const f: RuleFacts = { days_in_stage: 5, ai_score: 72 }
    expect(compareCondition(f, c('days_in_stage', 'gt', 3))).toBe(true)
    expect(compareCondition(f, c('days_in_stage', 'gt', 5))).toBe(false)
    expect(compareCondition(f, c('days_in_stage', 'gte', 5))).toBe(true)
    expect(compareCondition(f, c('ai_score', 'lt', 80))).toBe(true)
    expect(compareCondition(f, c('ai_score', 'lte', 72))).toBe(true)
    expect(compareCondition(f, c('ai_score', 'eq', 72))).toBe(true)
    expect(compareCondition(f, c('ai_score', 'neq', 72))).toBe(false)
  })

  it('never fires a numeric condition on unknown data', () => {
    expect(compareCondition({}, c('days_in_stage', 'gt', 3))).toBe(false)
    expect(compareCondition({ ai_score: null }, c('ai_score', 'lt', 50))).toBe(false)
  })

  it('handles choice operators', () => {
    const f: RuleFacts = { review_status: 'no', fit_bucket: 'weak' }
    expect(compareCondition(f, c('review_status', 'is', 'no'))).toBe(true)
    expect(compareCondition(f, c('review_status', 'is', 'yes'))).toBe(false)
    expect(compareCondition(f, c('fit_bucket', 'is_not', 'great'))).toBe(true)
  })

  it('"is" is false on unknown, "is_not" is true on unknown', () => {
    expect(compareCondition({}, c('review_status', 'is', 'yes'))).toBe(false)
    expect(compareCondition({}, c('review_status', 'is_not', 'yes'))).toBe(true)
  })

  it('handles boolean operators', () => {
    expect(compareCondition({ has_feedback: true }, c('has_feedback', 'is_true'))).toBe(true)
    expect(compareCondition({ has_feedback: false }, c('has_feedback', 'is_true'))).toBe(false)
    expect(compareCondition({ has_feedback: false }, c('has_feedback', 'is_false'))).toBe(true)
    // unknown is treated as "not true" → is_false holds, is_true doesn't
    expect(compareCondition({}, c('has_feedback', 'is_false'))).toBe(true)
    expect(compareCondition({}, c('has_feedback', 'is_true'))).toBe(false)
  })
})

describe('evaluateConditions', () => {
  const f: RuleFacts = { days_in_stage: 5, ai_score: 40, review_status: 'no' }

  it('empty conditions always fire', () => {
    expect(evaluateConditions(f, [])).toBe(true)
    expect(evaluateConditions(f, undefined)).toBe(true)
  })

  it('match all requires every clause', () => {
    expect(evaluateConditions(f, [c('days_in_stage', 'gt', 3), c('review_status', 'is', 'no')], 'all')).toBe(true)
    expect(evaluateConditions(f, [c('days_in_stage', 'gt', 3), c('review_status', 'is', 'yes')], 'all')).toBe(false)
  })

  it('match any needs one clause', () => {
    expect(evaluateConditions(f, [c('days_in_stage', 'gt', 99), c('review_status', 'is', 'no')], 'any')).toBe(true)
    expect(evaluateConditions(f, [c('days_in_stage', 'gt', 99), c('review_status', 'is', 'yes')], 'any')).toBe(false)
  })

  it('the "applied > 3 days" example fires', () => {
    expect(evaluateConditions({ days_in_stage: 4 }, [c('days_in_stage', 'gt', 3)])).toBe(true)
    expect(evaluateConditions({ days_in_stage: 2 }, [c('days_in_stage', 'gt', 3)])).toBe(false)
  })
})
