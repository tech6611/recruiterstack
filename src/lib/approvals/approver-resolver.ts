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
  const supabase = createAdminClient()

  switch (type) {
    case 'user': {
      const userId = (value as { user_id?: string }).user_id
      return userId ? [{ user_id: userId }] : []
    }

    case 'role': {
      const role = (value as { role?: string }).role
      if (!role) return []
      // role is supplied dynamically (any of our 4 OrgRoles); cast for the eq().
      const { data } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx.orgId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('role', role as any)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
      return (data ?? []).map(r => ({ user_id: (r as { user_id: string }).user_id }))
    }

    case 'hiring_team_member': {
      const teamRole = (value as { role?: string }).role
      if (!teamRole) return []

      // Resolve via the target's hiring team. For Openings: target → linked job(s)
      // → hiring team. We pick the first job linked to the opening; if none, fall
      // back to the opening's hiring_manager_id when role='hiring_manager'.
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
            return (members ?? []).map(m => ({ user_id: (m as { user_id: string }).user_id }))
          }
        }

        // Fallback: opening's own hiring_manager_id
        if (teamRole === 'hiring_manager') {
          const { data: opening } = await supabase
            .from('openings')
            .select('hiring_manager_id')
            .eq('id', ctx.targetId)
            .maybeSingle()
          const hmId = (opening as { hiring_manager_id: string | null } | null)?.hiring_manager_id
          return hmId ? [{ user_id: hmId }] : []
        }
        return []
      }

      // Job target: read directly from its hiring team.
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
        return (members ?? []).map(m => ({ user_id: (m as { user_id: string }).user_id }))
      }

      return []
    }

    case 'group': {
      // Phase F doesn't have a concrete groups table — interpret group_id as a
      // role string for now ("group of recruiters" etc.). Phase G adds a real
      // groups table with explicit memberships.
      const groupId = (value as { group_id?: string }).group_id
      if (!groupId) return []
      const { data } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx.orgId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('role', groupId as any)        // best-effort interpretation
        .eq('is_active', true)
      return (data ?? []).map(r => ({ user_id: (r as { user_id: string }).user_id }))
    }

    default:
      return []
  }
}
