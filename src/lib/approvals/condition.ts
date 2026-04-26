/**
 * Condition DSL evaluator.
 *
 * Used for:
 *   - approval_chains.scope_conditions (which chain to pick)
 *   - approval_chain_steps.condition (whether a step applies)
 *
 * DSL grammar (recursive):
 *   leaf  = { field: string, op: Op, value?: unknown }
 *   node  = { all: Cond[] } | { any: Cond[] } | { not: Cond } | leaf
 *
 * Supported ops: eq, neq, gt, gte, lt, lte, in, not_in, contains, exists.
 * Field paths support dot-notation: "comp_max", "location.country", "custom_fields.seniority".
 *
 * A null/undefined condition is treated as TRUE — convenient for unconditional steps.
 */

import type { Condition, ConditionLeaf, ConditionOp } from '@/lib/types/approvals'

export function evaluateCondition(cond: Condition | null | undefined, target: Record<string, unknown>): boolean {
  if (cond === null || cond === undefined) return true
  if ('all' in cond) return cond.all.every(c => evaluateCondition(c, target))
  if ('any' in cond) return cond.any.some(c => evaluateCondition(c, target))
  if ('not' in cond) return !evaluateCondition(cond.not, target)
  return evaluateLeaf(cond, target)
}

function evaluateLeaf(leaf: ConditionLeaf, target: Record<string, unknown>): boolean {
  const value = readPath(target, leaf.field)
  return apply(leaf.op, value, leaf.value)
}

function readPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined
  let cur: unknown = obj
  for (const segment of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[segment]
  }
  return cur
}

function apply(op: ConditionOp, lhs: unknown, rhs: unknown): boolean {
  switch (op) {
    case 'eq':       return lhs === rhs
    case 'neq':      return lhs !== rhs
    case 'gt':       return num(lhs) >  num(rhs)
    case 'gte':      return num(lhs) >= num(rhs)
    case 'lt':       return num(lhs) <  num(rhs)
    case 'lte':      return num(lhs) <= num(rhs)
    case 'in':       return Array.isArray(rhs) && rhs.includes(lhs as never)
    case 'not_in':   return Array.isArray(rhs) && !rhs.includes(lhs as never)
    case 'contains': return Array.isArray(lhs) && lhs.includes(rhs as never)
    case 'exists':   return lhs !== undefined && lhs !== null
    default:         return false
  }
}

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') return Number(v)
  return NaN
}
