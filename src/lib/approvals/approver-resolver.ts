/**
 * Resolves chain step approvers to a concrete list of user_ids at activation time.
 *
 * Approver types (from migration 036):
 *   user                — fixed user_id
 *   role                — first user holding the org role (admin / hiring_manager / …)
 *   hiring_team_member  — user with the given role on this target's hiring team
 *   group               — set of user_ids; min_approvals decides how many must approve
 *
 * NEVER caches approvers across runs; resolution always re-reads org state so
 * a deactivated user falls out automatically. Phase G adds delegation lookup.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { ApproverType, ApproverValue, ResolvedApprover } from '@/lib/types/approvals'

const MAX_DELEGATE_HOPS = 5

/**
 * If `userId` is OOO (out_of_office_until > now()) or deactivated, return the
 * delegate. Recurses up to MAX_DELEGATE_HOPS to handle delegate-of-delegate
 * chains. Returns null if no usable user is found.
 */
async function applyDelegation(userId: string, depth = 0): Promise<string | null> {
  if (depth >= MAX_DELEGATE_HOPS) return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('users')
    .select('id, deactivated_at, out_of_office_until, delegate_user_id')
    .eq('id', userId)
    .maybeSingle()
  const u = data as { id: string; deactivated_at: string | null; out_of_office_until: string | null; delegate_user_id: string | null } | null
  if (!u) return null

  const isDeactivated = u.deactivated_at !== null
  const isOoo = u.out_of_office_until !== null && new Date(u.out_of_office_until).getTime() > Date.now()
  if (!isDeactivated && !isOoo) return u.id
  if (!u.delegate_user_id) return null
  return applyDelegation(u.delegate_user_id, depth + 1)
}

async function applyDelegationToList(userIds: string[]): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of userIds) {
    const resolved = await applyDelegation(id)
    if (resolved && !seen.has(resolved)) {
      out.push(resolved)
      seen.add(resolved)
    }
  }
  return out
}

interface ResolveContext {
  orgId:      string
  targetType: 'opening' | 'job' | 'offer'
  targetId:   string
}

export async function resolveApprovers(
  type:    ApproverType,
  value:   ApproverValue,
  ctx:     ResolveContext,
): Promise<ResolvedApprover[]> {
  // 1) Compute raw user_ids per approver type
  const raw = await rawApproverIds(type, value, ctx)
  // 2) Apply OOO/deactivation delegation; dedupe; wrap as ResolvedApprover
  const final = await applyDelegationToList(raw)
  return final.map(user_id => ({ user_id }))
}

/**
 * Returns user_ids before delegation processing. Pure lookup per approver
 * type — kept separate so applyDelegationToList can run uniformly on the
 * combined list, regardless of resolution path.
 */
async function rawApproverIds(
  type: ApproverType,
  value: ApproverValue,
  ctx: ResolveContext,
): Promise<string[]> {
  const supabase = createAdminClient()

  switch (type) {
    case 'user': {
      const userId = (value as { user_id?: string }).user_id
      return userId ? [userId] : []
    }

    case 'role': {
      const role = (value as { role?: string }).role
      if (!role) return []
      const { data } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx.orgId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('role', role as any)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
      return (data ?? []).map(r => (r as { user_id: string }).user_id)
    }

    case 'hiring_team_member': {
      const teamRole = (value as { role?: string }).role
      if (!teamRole) return []

      if (ctx.targetType === 'opening') {
        const { data: link } = await supabase
          .from('job_openings')
          .select('job_id')
          .eq('opening_id', ctx.targetId)
          .order('linked_at', { ascending: true })
          .limit(1)
        const jobId = (link as { job_id: string }[] | null)?.[0]?.job_id

        if (jobId) {
          const { data: job } = await supabase
            .from('jobs')
            .select('hiring_team_id')
            .eq('id', jobId)
            .maybeSingle()
          const teamId = (job as { hiring_team_id: string | null } | null)?.hiring_team_id
          if (teamId) {
            const { data: members } = await supabase
              .from('hiring_team_members')
              .select('user_id')
              .eq('hiring_team_id', teamId)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .eq('role', teamRole as any)
            return (members ?? []).map(m => (m as { user_id: string }).user_id)
          }
        }

        if (teamRole === 'hiring_manager') {
          const { data: opening } = await supabase
            .from('openings')
            .select('hiring_manager_id')
            .eq('id', ctx.targetId)
            .maybeSingle()
          const hmId = (opening as { hiring_manager_id: string | null } | null)?.hiring_manager_id
          return hmId ? [hmId] : []
        }
        return []
      }

      if (ctx.targetType === 'job') {
        const { data: job } = await supabase
          .from('jobs')
          .select('hiring_team_id')
          .eq('id', ctx.targetId)
          .maybeSingle()
        const teamId = (job as { hiring_team_id: string | null } | null)?.hiring_team_id
        if (!teamId) return []
        const { data: members } = await supabase
          .from('hiring_team_members')
          .select('user_id')
          .eq('hiring_team_id', teamId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('role', teamRole as any)
        return (members ?? []).map(m => (m as { user_id: string }).user_id)
      }

      return []
    }

    case 'group': {
      // Phase G: real approval_groups + approval_group_members tables.
      const groupId = (value as { group_id?: string }).group_id
      if (!groupId) return []
      const { data } = await supabase
        .from('approval_group_members')
        .select('user_id')
        .eq('group_id', groupId)
      return (data ?? []).map(r => (r as { user_id: string }).user_id)
    }

    default:
      return []
  }
}
