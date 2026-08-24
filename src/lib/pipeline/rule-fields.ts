// Rule fields & operators — the vocabulary for a stage automation's IF clause.
// Pure, no I/O. Single source of truth shared by the builder UI, the validator,
// and (Phase B) the evaluator, so all three agree on what's testable and how.

import type { RuleField, RuleOperator } from '@/lib/types/pipeline-automations'

export type FieldType = 'number' | 'choice' | 'boolean'

export interface RuleFieldDef {
  field: RuleField
  label: string
  type: FieldType
  /** For 'choice' fields: the allowed values + labels. */
  options?: { value: string; label: string }[]
  /** Hint shown next to a number input (e.g. "days", "0–100"). */
  unit?: string
}

export const RULE_FIELDS: readonly RuleFieldDef[] = [
  { field: 'days_in_stage', label: 'Days in stage', type: 'number', unit: 'days' },
  { field: 'ai_score', label: 'Fit score', type: 'number', unit: '0–100' },
  {
    field: 'fit_bucket', label: 'Fit', type: 'choice',
    options: [
      { value: 'great', label: 'Great' }, { value: 'good', label: 'Good' },
      { value: 'okay', label: 'Okay' }, { value: 'weak', label: 'Weak' },
    ],
  },
  {
    field: 'review_status', label: 'Recruiter decision', type: 'choice',
    options: [
      { value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' },
      { value: 'no', label: 'No' }, { value: 'unreviewed', label: 'Not reviewed' },
    ],
  },
  { field: 'has_feedback', label: 'Interview feedback submitted', type: 'boolean' },
  {
    field: 'feedback_result', label: 'Interview feedback', type: 'choice',
    options: [
      { value: 'strong_yes', label: 'Strong yes' }, { value: 'yes', label: 'Yes' },
      { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' },
    ],
  },
  {
    field: 'source', label: 'Source', type: 'choice',
    options: [
      { value: 'applied', label: 'Applied' }, { value: 'sourced', label: 'Sourced' },
      { value: 'referral', label: 'Referral' },
    ],
  },
  { field: 'missing_must_have', label: 'Missing a must-have', type: 'boolean' },
  // Lead-funnel outreach vocabulary: whether the candidate is in an outreach
  // sequence, and whether they've replied. Reply is set externally (SendGrid
  // Inbound Parse → the enrolment is marked 'replied'); the engine only reads it.
  { field: 'enrolled', label: 'Added to a sequence', type: 'boolean' },
  { field: 'replied', label: 'Replied to outreach', type: 'boolean' },
  // AI phone-screen (Vobiz voice call) outcome. The call runs in the Django
  // backend and writes voice_calls.ai_score/ai_recommendation; the engine reads
  // the latest scored call for the candidacy.
  { field: 'has_ai_call', label: 'AI call completed', type: 'boolean' },
  { field: 'ai_call_score', label: 'AI call score', type: 'number', unit: '0–100' },
] as const

const FIELD_BY_ID = new Map(RULE_FIELDS.map(f => [f.field, f]))
export function ruleField(field: string): RuleFieldDef | undefined { return FIELD_BY_ID.get(field as RuleField) }

/** Operators valid for each field type, with human labels. */
export const OPERATORS: Record<FieldType, { op: RuleOperator; label: string }[]> = {
  number: [
    { op: 'gt', label: 'greater than' }, { op: 'gte', label: 'at least' },
    { op: 'lt', label: 'less than' }, { op: 'lte', label: 'at most' },
    { op: 'eq', label: 'equals' }, { op: 'neq', label: 'is not' },
  ],
  choice: [{ op: 'is', label: 'is' }, { op: 'is_not', label: 'is not' }],
  boolean: [{ op: 'is_true', label: 'is yes' }, { op: 'is_false', label: 'is no' }],
}

/** Operators allowed for a given field (empty if unknown field). */
export function operatorsForField(field: string): { op: RuleOperator; label: string }[] {
  const def = ruleField(field)
  return def ? OPERATORS[def.type] : []
}

/** Is (field, operator, value) a well-formed condition? Pure — used by the API
 *  validator and the UI to disable "save" on a half-built clause. */
export function isValidCondition(field: string, operator: string, value: unknown): boolean {
  const def = ruleField(field)
  if (!def) return false
  const okOp = OPERATORS[def.type].some(o => o.op === operator)
  if (!okOp) return false
  if (def.type === 'boolean') return true // no value needed
  if (def.type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (def.type === 'choice') return typeof value === 'string' && !!def.options?.some(o => o.value === value)
  return false
}

/** Human-readable rendering of one condition, e.g. "Days in stage greater than 3". */
export function describeCondition(field: string, operator: string, value: unknown): string {
  const def = ruleField(field)
  if (!def) return ''
  const opLabel = OPERATORS[def.type].find(o => o.op === operator)?.label ?? operator
  if (def.type === 'boolean') return `${def.label} ${opLabel}`
  if (def.type === 'choice') {
    const vLabel = def.options?.find(o => o.value === value)?.label ?? String(value)
    return `${def.label} ${opLabel} ${vLabel}`
  }
  return `${def.label} ${opLabel} ${value}${def.unit && def.unit !== '0–100' ? ' ' + def.unit : ''}`
}
