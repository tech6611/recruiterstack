// Rule evaluation — pure. Given a candidacy's facts and a rule's conditions,
// decide whether the rule fires. No I/O; this is the safety-critical core that
// gates whether a candidate gets auto-moved/archived, so it's heavily tested.

import type { RuleCondition, ConditionMatch } from '@/lib/types/pipeline-automations'

/** The facts about one candidacy that conditions can test. Any field may be
 *  unknown (null/undefined) — a condition against an unknown fact is false. */
export interface RuleFacts {
  days_in_stage?: number | null
  ai_score?: number | null
  fit_bucket?: string | null
  review_status?: string | null
  has_feedback?: boolean | null
  feedback_result?: string | null
  source?: string | null
  missing_must_have?: boolean | null
  enrolled?: boolean | null
  replied?: boolean | null
  has_ai_call?: boolean | null
  ai_call_score?: number | null
}

const asNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Evaluate one condition against the facts. Unknown facts → false (never fire
 *  on missing data). */
export function compareCondition(facts: RuleFacts, c: RuleCondition): boolean {
  const actual = (facts as Record<string, unknown>)[c.field]

  switch (c.operator) {
    case 'gt': case 'gte': case 'lt': case 'lte': case 'eq': case 'neq': {
      const a = asNum(actual)
      const b = asNum(c.value)
      if (a === null || b === null) return false
      switch (c.operator) {
        case 'gt': return a > b
        case 'gte': return a >= b
        case 'lt': return a < b
        case 'lte': return a <= b
        case 'eq': return a === b
        case 'neq': return a !== b
      }
      return false
    }
    case 'is':
      return actual != null && String(actual) === String(c.value)
    case 'is_not':
      // Unknown value is "not X" (it isn't X). Matches recruiter intent, e.g.
      // "recruiter decision is not Yes" should include the un-reviewed.
      return String(actual ?? '') !== String(c.value)
    case 'is_true':
      return actual === true
    case 'is_false':
      return actual !== true
    default:
      return false
  }
}

/** Do the conditions hold? Empty conditions → true (a rule with no IF always
 *  fires on its trigger). `match` combines multiple clauses. */
export function evaluateConditions(
  facts: RuleFacts,
  conditions: RuleCondition[] | undefined,
  match: ConditionMatch = 'all',
): boolean {
  const cs = conditions ?? []
  if (cs.length === 0) return true
  return match === 'any'
    ? cs.some(c => compareCondition(facts, c))
    : cs.every(c => compareCondition(facts, c))
}
