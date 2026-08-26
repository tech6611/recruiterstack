import { describe, it, expect } from 'vitest'
import {
  applyBoardConditions,
  isValidBoardCondition,
  describeBoardCondition,
  type BoardFilterCondition,
  type BoardFilterCtx,
} from './board-filters'
import type { Application } from '@/lib/types/database'

// Minimal Application fixtures — only the fields the evaluator reads.
const mk = (over: Partial<Application> & { id: string }): Application => ({
  id: over.id,
  candidate: over.candidate,
  source: over.source ?? 'applied',
  stage_id: over.stage_id ?? 'stg_1',
  ai_score: over.ai_score ?? null,
  ai_recommendation: over.ai_recommendation ?? null,
  review_status: over.review_status ?? 'unreviewed',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)

const ctx: BoardFilterCtx = { daysInStage: (a) => (a.id === 'old' ? 10 : 1) }

const APPS: Application[] = [
  mk({ id: 'a', candidate: { name: 'Ada Lovelace' } as never, ai_score: 88, ai_recommendation: 'strong_yes', source: 'sourced' }),
  mk({ id: 'b', candidate: { name: 'Grace Hopper' } as never, ai_score: 62, ai_recommendation: 'maybe', source: 'applied' }),
  mk({ id: 'old', candidate: { name: 'Alan Turing' } as never, ai_score: null, source: 'referral' }),
]

describe('applyBoardConditions', () => {
  it('returns everything when there are no conditions', () => {
    expect(applyBoardConditions(APPS, [], 'all', ctx)).toHaveLength(3)
  })

  it('number: ai_score at least 75', () => {
    const c: BoardFilterCondition[] = [{ field: 'ai_score', operator: 'gte', value: 75 }]
    expect(applyBoardConditions(APPS, c, 'all', ctx).map(a => a.id)).toEqual(['a'])
  })

  it('null number field never matches a numeric condition', () => {
    const c: BoardFilterCondition[] = [{ field: 'ai_score', operator: 'lt', value: 100 }]
    // 'old' has null ai_score → excluded
    expect(applyBoardConditions(APPS, c, 'all', ctx).map(a => a.id)).toEqual(['a', 'b'])
  })

  it('text contains is case-insensitive on candidate name', () => {
    const c: BoardFilterCondition[] = [{ field: 'name', operator: 'contains', value: 'grace' }]
    expect(applyBoardConditions(APPS, c, 'all', ctx).map(a => a.id)).toEqual(['b'])
  })

  it('choice: source is sourced', () => {
    const c: BoardFilterCondition[] = [{ field: 'source', operator: 'is', value: 'sourced' }]
    expect(applyBoardConditions(APPS, c, 'all', ctx).map(a => a.id)).toEqual(['a'])
  })

  it('boolean: scored is no', () => {
    const c: BoardFilterCondition[] = [{ field: 'scored', operator: 'is_false' }]
    expect(applyBoardConditions(APPS, c, 'all', ctx).map(a => a.id)).toEqual(['old'])
  })

  it('days_in_stage uses the ctx helper', () => {
    const c: BoardFilterCondition[] = [{ field: 'days_in_stage', operator: 'gt', value: 5 }]
    expect(applyBoardConditions(APPS, c, 'all', ctx).map(a => a.id)).toEqual(['old'])
  })

  it("match 'all' ANDs; match 'any' ORs", () => {
    const c: BoardFilterCondition[] = [
      { field: 'ai_score', operator: 'gte', value: 75 },
      { field: 'source', operator: 'is', value: 'applied' },
    ]
    expect(applyBoardConditions(APPS, c, 'all', ctx).map(a => a.id)).toEqual([]) // none are both
    expect(applyBoardConditions(APPS, c, 'any', ctx).map(a => a.id)).toEqual(['a', 'b'])
  })
})

describe('isValidBoardCondition', () => {
  it('accepts a well-formed number condition, rejects a bad value', () => {
    expect(isValidBoardCondition({ field: 'ai_score', operator: 'gte', value: 75 })).toBe(true)
    expect(isValidBoardCondition({ field: 'ai_score', operator: 'gte', value: 'lots' })).toBe(false)
  })
  it('validates the dynamic stage field against known ids', () => {
    expect(isValidBoardCondition({ field: 'stage', operator: 'is', value: 'stg_9' }, ['stg_1', 'stg_9'])).toBe(true)
    expect(isValidBoardCondition({ field: 'stage', operator: 'is', value: 'ghost' }, ['stg_1'])).toBe(false)
  })
  it('rejects an unknown field or operator', () => {
    expect(isValidBoardCondition({ field: 'salary', operator: 'gt', value: 1 })).toBe(false)
    expect(isValidBoardCondition({ field: 'ai_score', operator: 'contains', value: 5 })).toBe(false)
  })
})

describe('describeBoardCondition', () => {
  it('reads number/choice/boolean conditions in words', () => {
    expect(describeBoardCondition({ field: 'ai_score', operator: 'gte', value: 75 })).toBe('AI fit score at least 75')
    expect(describeBoardCondition({ field: 'fit_signal', operator: 'is', value: 'strong_yes' })).toBe('AI fit is Strong yes')
    expect(describeBoardCondition({ field: 'scored', operator: 'is_false' })).toBe('Has AI score is no')
  })
  it('uses labelForValue for dynamic stage values', () => {
    const label = (f: string, v: string | number) => (f === 'stage' && v === 'stg_1' ? 'Screening' : String(v))
    expect(describeBoardCondition({ field: 'stage', operator: 'is', value: 'stg_1' }, label)).toBe('Stage is Screening')
  })
})
