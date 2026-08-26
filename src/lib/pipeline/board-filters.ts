// Board filter conditions — a pure, client-side "field + operator + value" model
// for the candidate board's Ashby-style filters (the "Add Field to Match" builder
// and the AI Assistant both produce these). Evaluated over already-loaded
// Application objects; no I/O. Single source of truth for what's filterable, how,
// and how a condition reads in words — shared by the UI, the AI endpoint's
// validator, and the evaluator.

import type { Application } from '@/lib/types/database'

export type BoardFilterType = 'text' | 'number' | 'choice' | 'boolean'

export type BoardFilterOp =
  | 'contains' | 'is' | 'is_not'        // text / choice
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq'  // number
  | 'is_true' | 'is_false'              // boolean

export interface BoardFilterCondition {
  field: string
  operator: BoardFilterOp
  value?: string | number
}

export interface BoardFilterFieldDef {
  field: string
  label: string
  type: BoardFilterType
  /** For 'choice' fields: fixed allowed values. Omitted when options are dynamic. */
  options?: { value: string; label: string }[]
  /** 'stage' → the option list is the job's stages, injected at runtime. */
  dynamic?: 'stage'
  unit?: string
}

export const BOARD_FILTER_FIELDS: readonly BoardFilterFieldDef[] = [
  { field: 'name',          label: 'Candidate name', type: 'text' },
  {
    field: 'source', label: 'Source', type: 'choice',
    options: [
      { value: 'applied', label: 'Applied' }, { value: 'sourced', label: 'Sourced' },
      { value: 'referral', label: 'Referral' }, { value: 'manual', label: 'Manual' },
      { value: 'imported', label: 'Imported' },
    ],
  },
  { field: 'stage',         label: 'Stage', type: 'choice', dynamic: 'stage' },
  { field: 'ai_score',      label: 'AI fit score', type: 'number', unit: '0–100' },
  {
    field: 'fit_signal', label: 'AI fit', type: 'choice',
    options: [
      { value: 'strong_yes', label: 'Strong yes' }, { value: 'yes', label: 'Yes' },
      { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' },
    ],
  },
  { field: 'days_in_stage', label: 'Days in stage', type: 'number', unit: 'days' },
  {
    field: 'review_status', label: 'Recruiter decision', type: 'choice',
    options: [
      { value: 'unreviewed', label: 'Not reviewed' }, { value: 'reviewed', label: 'Reviewed' },
      { value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' },
    ],
  },
  { field: 'scored',        label: 'Has AI score', type: 'boolean' },
] as const

const FIELD_BY_ID = new Map(BOARD_FILTER_FIELDS.map(f => [f.field, f]))
export function boardFilterField(field: string): BoardFilterFieldDef | undefined {
  return FIELD_BY_ID.get(field)
}

export const BOARD_OPERATORS: Record<BoardFilterType, { op: BoardFilterOp; label: string }[]> = {
  text:   [{ op: 'contains', label: 'contains' }, { op: 'is', label: 'is' }, { op: 'is_not', label: 'is not' }],
  number: [
    { op: 'gt', label: 'greater than' }, { op: 'gte', label: 'at least' },
    { op: 'lt', label: 'less than' }, { op: 'lte', label: 'at most' }, { op: 'eq', label: 'equals' },
  ],
  choice: [{ op: 'is', label: 'is' }, { op: 'is_not', label: 'is not' }],
  boolean:[{ op: 'is_true', label: 'is yes' }, { op: 'is_false', label: 'is no' }],
}

export function operatorsForBoardField(field: string): { op: BoardFilterOp; label: string }[] {
  const def = boardFilterField(field)
  return def ? BOARD_OPERATORS[def.type] : []
}

/** Options for a field — fixed, or the injected stage list for the 'stage' field. */
export function optionsForBoardField(
  field: string,
  stageOptions: { value: string; label: string }[] = [],
): { value: string; label: string }[] {
  const def = boardFilterField(field)
  if (!def) return []
  if (def.dynamic === 'stage') return stageOptions
  return def.options ?? []
}

/** Is (field, operator, value) well-formed? Used to sanitize AI output + gate the
 *  manual builder's "add" button. `stageIds` validates the dynamic stage field. */
export function isValidBoardCondition(
  c: { field?: string; operator?: string; value?: unknown },
  stageIds: string[] = [],
): c is BoardFilterCondition {
  const def = c.field ? boardFilterField(c.field) : undefined
  if (!def || !c.operator) return false
  if (!BOARD_OPERATORS[def.type].some(o => o.op === c.operator)) return false
  if (def.type === 'boolean') return true
  if (def.type === 'number') return typeof c.value === 'number' && Number.isFinite(c.value)
  if (def.type === 'text')   return typeof c.value === 'string' && c.value.length > 0
  if (def.type === 'choice') {
    if (typeof c.value !== 'string') return false
    if (def.dynamic === 'stage') return stageIds.includes(c.value)
    return !!def.options?.some(o => o.value === c.value)
  }
  return false
}

/** Runtime helpers the evaluator needs for computed fields. */
export interface BoardFilterCtx {
  daysInStage: (a: Application) => number
}

function rawFieldValue(app: Application, field: string, ctx: BoardFilterCtx): string | number | boolean | null {
  switch (field) {
    case 'name':          return app.candidate?.name ?? ''
    case 'source':        return app.source ?? ''
    case 'stage':         return app.stage_id ?? ''
    case 'ai_score':      return app.ai_score
    case 'fit_signal':    return app.ai_recommendation ?? ''
    case 'days_in_stage': return ctx.daysInStage(app)
    case 'review_status': return app.review_status ?? 'unreviewed'
    case 'scored':        return app.ai_score !== null
    default:              return null
  }
}

export function evaluateBoardCondition(app: Application, c: BoardFilterCondition, ctx: BoardFilterCtx): boolean {
  const def = boardFilterField(c.field)
  if (!def) return true // unknown field never narrows
  const v = rawFieldValue(app, c.field, ctx)

  if (def.type === 'boolean') {
    const b = v === true
    return c.operator === 'is_true' ? b : !b
  }
  if (def.type === 'number') {
    if (typeof v !== 'number' || typeof c.value !== 'number') return false
    switch (c.operator) {
      case 'gt':  return v >  c.value
      case 'gte': return v >= c.value
      case 'lt':  return v <  c.value
      case 'lte': return v <= c.value
      case 'eq':  return v === c.value
      default:    return false
    }
  }
  // text / choice
  const sv = String(v).toLowerCase()
  const cv = String(c.value ?? '').toLowerCase()
  switch (c.operator) {
    case 'contains': return sv.includes(cv)
    case 'is':       return sv === cv
    case 'is_not':   return sv !== cv
    default:         return false
  }
}

/** Apply a set of conditions to a flat list. match='all' (AND) or 'any' (OR).
 *  Empty condition list returns the input unchanged. */
export function applyBoardConditions(
  apps: Application[],
  conditions: BoardFilterCondition[],
  match: 'all' | 'any',
  ctx: BoardFilterCtx,
): Application[] {
  if (conditions.length === 0) return apps
  return apps.filter(app => {
    const results = conditions.map(c => evaluateBoardCondition(app, c, ctx))
    return match === 'all' ? results.every(Boolean) : results.some(Boolean)
  })
}

/** Human-readable rendering of one condition, e.g. "AI fit score at least 75".
 *  `labelForValue` resolves dynamic (stage) values to a name. */
export function describeBoardCondition(
  c: BoardFilterCondition,
  labelForValue?: (field: string, value: string | number) => string,
): string {
  const def = boardFilterField(c.field)
  if (!def) return ''
  const opLabel = BOARD_OPERATORS[def.type].find(o => o.op === c.operator)?.label ?? c.operator
  if (def.type === 'boolean') return `${def.label} ${opLabel}`
  const valLabel =
    labelForValue && c.value != null ? labelForValue(c.field, c.value)
    : def.type === 'choice' ? (def.options?.find(o => o.value === c.value)?.label ?? String(c.value))
    : String(c.value)
  const unit = def.type === 'number' && def.unit && def.unit !== '0–100' ? ` ${def.unit}` : ''
  return `${def.label} ${opLabel} ${valLabel}${unit}`
}
