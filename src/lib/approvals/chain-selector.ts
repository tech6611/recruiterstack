/**
 * Picks the most-specific approval chain for a target.
 *
 * Algorithm:
 *   1. Fetch all active chains for (orgId, targetType).
 *   2. Filter to those whose scope_conditions evaluate true against the target.
 *   3. Pick the most specific (highest leaf-count). On ties, most recently updated.
 *   4. Return null if no chain matches.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { evaluateCondition } from './condition'
import type { Condition, ApprovalChain, ApprovalTargetType } from '@/lib/types/approvals'

export async function selectChain(
  orgId: string,
  targetType: ApprovalTargetType,
  target: Record<string, unknown>,
): Promise<ApprovalChain | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('approval_chains')
    .select('*')
    .eq('org_id', orgId)
    .eq('target_type', targetType)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  const chains = (data ?? []) as ApprovalChain[]
  const matches: Array<{ chain: ApprovalChain; specificity: number }> = []

  for (const chain of chains) {
    if (!evaluateCondition(chain.scope_conditions ?? null, target)) continue
    matches.push({ chain, specificity: countLeaves(chain.scope_conditions ?? null) })
  }

  if (matches.length === 0) return null

  // Highest specificity first; ties broken by the original order (descending updated_at).
  matches.sort((a, b) => b.specificity - a.specificity)
  return matches[0].chain
}

function countLeaves(cond: Condition | null): number {
  if (!cond) return 0
  if ('all' in cond) return cond.all.reduce((s, c) => s + countLeaves(c), 0)
  if ('any' in cond) return cond.any.reduce((s, c) => s + countLeaves(c), 0)
  if ('not' in cond) return countLeaves(cond.not)
  return 1
}
