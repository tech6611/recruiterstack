/**
 * Approver REACHABILITY — can this person actually act?
 *
 * An approver is reachable when they are an ACTIVE member of the approval's org and
 * their user row is not deactivated. Approvals used to be assigned to whoever a chain
 * named, including people who could no longer sign in (a login-system change left
 * "ghost" rows behind); the step then waited on nobody and the funnel stalled silently.
 *
 * Now: unreachable approvers are dropped at activation (audited), a step left with no
 * approver is flagged and org admins are notified, admins can reassign it, and when a
 * member is removed their pending steps are re-checked immediately.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createNotification } from '@/lib/api/notify'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export interface Reachability { reachable: string[]; dropped: string[] }

/** Split user ids into those who can act in this org and those who cannot. Order kept. */
export async function filterReachableApprovers(supabase: Supabase, orgId: string, userIds: string[]): Promise<Reachability> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!ids.length) return { reachable: [], dropped: [] }
  const sb = supabase as unknown as LooseSb
  const [{ data: members }, { data: users }] = await Promise.all([
    sb.from('org_members').select('user_id').eq('org_id', orgId).eq('is_active', true).in('user_id', ids),
    sb.from('users').select('id').in('id', ids).is('deactivated_at', null),
  ])
  const active = new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id))
  const live = new Set(((users ?? []) as { id: string }[]).map((u) => u.id))
  const reachable = ids.filter((id) => active.has(id) && live.has(id))
  const dropped = ids.filter((id) => !(active.has(id) && live.has(id)))
  return { reachable, dropped }
}

/** Tell org admins a step is waiting on nobody. Org-wide in-app notification (no user targeting needed). */
export async function notifyStepUnassigned(input: { orgId: string; approvalId: string; stepId: string; stepName: string; targetType: string; targetId: string; reason: string }): Promise<void> {
  try {
    await createNotification({
      orgId: input.orgId,
      type: 'approval_needs_approver',
      title: `Approval step "${input.stepName}" has no approver who can act`,
      body: `${input.reason} Reassign it from the Approvals page so the request can move.`,
      resourceType: 'approval',
      resourceId: input.approvalId,
    })
  } catch (e) {
    logger.error('[reachability] notify unassigned step', e)
  }
}

/**
 * A member lost access (removed from the org / deactivated): take them off every
 * pending, activated step in this org's approvals. Steps left with no approver are
 * flagged for admins. Returns counts for logging.
 */
export async function dropApproverFromPendingSteps(supabase: Supabase, orgId: string, userId: string): Promise<{ steps: number; unassigned: number }> {
  const sb = supabase as unknown as LooseSb
  const { data: approvals } = await sb.from('approvals').select('id, target_type, target_id').eq('org_id', orgId).eq('status', 'pending')
  const byApproval = new Map(((approvals ?? []) as { id: string; target_type: string; target_id: string }[]).map((a) => [a.id, a]))
  if (!byApproval.size) return { steps: 0, unassigned: 0 }
  const { data: steps } = await sb
    .from('approval_steps')
    .select('id, approval_id, approvers, chain_step_id')
    .eq('status', 'pending')
    .not('activated_at', 'is', null)
    .in('approval_id', Array.from(byApproval.keys()))
    .filter('approvers', 'cs', JSON.stringify([{ user_id: userId }]))
  let touched = 0, unassigned = 0
  for (const s of (steps ?? []) as { id: string; approval_id: string; approvers: { user_id: string }[]; chain_step_id: string }[]) {
    const remaining = (s.approvers ?? []).filter((a) => a.user_id !== userId)
    await sb.from('approval_steps').update({ approvers: remaining }).eq('id', s.id)
    touched++
    if (!remaining.length) {
      unassigned++
      const a = byApproval.get(s.approval_id)!
      const { data: cs } = await sb.from('approval_chain_steps').select('name').eq('id', s.chain_step_id).maybeSingle()
      await notifyStepUnassigned({ orgId, approvalId: s.approval_id, stepId: s.id, stepName: (cs as { name?: string } | null)?.name ?? 'Approval', targetType: a.target_type, targetId: a.target_id, reason: 'Its only approver no longer has access to this workspace.' })
    }
  }
  return { steps: touched, unassigned }
}

/** Pending, activated steps in this org that currently have NO approver — for admins to reassign. */
export async function listUnassignedSteps(supabase: Supabase, orgId: string): Promise<{ step_id: string; approval_id: string; step_index: number; activated_at: string | null; due_at: string | null }[]> {
  const sb = supabase as unknown as LooseSb
  const { data: approvals } = await sb.from('approvals').select('id').eq('org_id', orgId).eq('status', 'pending')
  const ids = ((approvals ?? []) as { id: string }[]).map((a) => a.id)
  if (!ids.length) return []
  const { data: steps } = await sb
    .from('approval_steps')
    .select('id, approval_id, step_index, activated_at, due_at')
    .eq('status', 'pending')
    .not('activated_at', 'is', null)
    .in('approval_id', ids)
    .eq('approvers', '[]')
  return ((steps ?? []) as { id: string; approval_id: string; step_index: number; activated_at: string | null; due_at: string | null }[])
    .map((s) => ({ step_id: s.id, approval_id: s.approval_id, step_index: s.step_index, activated_at: s.activated_at, due_at: s.due_at }))
}
