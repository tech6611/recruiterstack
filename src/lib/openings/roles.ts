// Hiring-team roles on a requisition (Phase 3): who was added / removed,
// tell them, and move in-flight work when the hiring manager changes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/api/notify'
import { sendEmail } from '@/lib/email/send'
import { logger } from '@/lib/logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export const ROLE_COLUMNS = ['hiring_manager_id', 'recruiter_id', 'coordinator_id', 'sourcer_id'] as const
export type RoleColumn = typeof ROLE_COLUMNS[number]
export const ROLE_LABEL: Record<RoleColumn, string> = {
  hiring_manager_id: 'hiring manager', recruiter_id: 'recruiter', coordinator_id: 'recruiting coordinator', sourcer_id: 'sourcer',
}

export type RoleChange = { role: RoleColumn; from: string | null; to: string | null }

/** Pure: which role assignments changed between two opening rows. */
export function diffRoles(before: Record<string, unknown>, after: Record<string, unknown>): RoleChange[] {
  const out: RoleChange[] = []
  for (const role of ROLE_COLUMNS) {
    const from = (before[role] as string | null | undefined) ?? null
    const to   = (after[role]  as string | null | undefined) ?? null
    if (from !== to) out.push({ role, from, to })
  }
  return out
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://recruiterstack.in'

/** Tell people they were added to / removed from a requisition's hiring team (in-app + email). Best-effort. */
export async function notifyRoleChanges(
  supabase: SupabaseClient, orgId: string, opening: { id: string; title: string }, changes: RoleChange[], actorUserId: string | null,
): Promise<void> {
  if (!changes.length) return
  try {
    const sb = supabase as unknown as Loose
    const ids = new Set<string>()
    for (const c of changes) { if (c.from) ids.add(c.from); if (c.to) ids.add(c.to) }
    if (actorUserId) ids.add(actorUserId)
    const { data: users } = await sb.from('users').select('id, email, full_name').in('id', Array.from(ids))
    const byId = new Map(((users ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map(u => [u.id, u]))
    const actor = actorUserId ? byId.get(actorUserId) : null
    const actorName = actor?.full_name || actor?.email || 'A teammate'
    const link = `${APP_URL()}/openings/${opening.id}`

    for (const c of changes) {
      if (c.to && c.to !== actorUserId) {
        const u = byId.get(c.to)
        await createNotification({
          orgId, userId: c.to, type: 'role_assigned',
          title: `You're now the ${ROLE_LABEL[c.role]} on ${opening.title}`,
          body: `${actorName} added you as ${ROLE_LABEL[c.role]} on this requisition. You can see its jobs and interviews from now on.`,
          resourceType: 'opening', resourceId: opening.id,
        })
        if (u?.email) {
          await sendEmail({
            to: u.email,
            subject: `You're now the ${ROLE_LABEL[c.role]} on ${opening.title}`,
            html: `<p>${actorName} added you as <strong>${ROLE_LABEL[c.role]}</strong> on the requisition <strong>${opening.title}</strong>.</p><p><a href="${link}">Open the requisition</a></p>`,
          }).catch(() => undefined)
        }
      }
      if (c.from && c.from !== actorUserId) {
        await createNotification({
          orgId, userId: c.from, type: 'role_removed',
          title: `You're no longer the ${ROLE_LABEL[c.role]} on ${opening.title}`,
          body: `${actorName} changed the ${ROLE_LABEL[c.role]} on this requisition.`,
          resourceType: 'opening', resourceId: opening.id,
        })
      }
    }
  } catch (e) {
    logger.warn('[roles] notify failed', { openingId: opening.id, e })
  }
}

/**
 * The hiring manager changed → move what was waiting on the old one to the new
 * one, across every job linked to the requisition:
 *   - a pending interview-plan change whose approver was the old HM
 *   - pending approval steps (job / requisition / requisition-change) naming the old HM
 * Returns counts for the UI / audit. Interviews are not touched (the interviewer is
 * whoever was booked; rescheduling is a human decision).
 */
export async function reassignInFlight(
  supabase: SupabaseClient, orgId: string, openingId: string, fromUserId: string | null, toUserId: string | null,
): Promise<{ plan_approvals: number; approval_steps: number }> {
  const out = { plan_approvals: 0, approval_steps: 0 }
  if (!fromUserId || !toUserId || fromUserId === toUserId) return out
  const sb = supabase as unknown as Loose
  try {
    const { data: links } = await sb.from('job_openings').select('job_id').eq('opening_id', openingId)
    const jobIds = ((links ?? []) as Array<{ job_id: string }>).map(l => l.job_id)

    // Interview-plan changes parked for the old HM's approval.
    if (jobIds.length) {
      const { data: plans } = await sb.from('interview_plans').select('id, pending_meta').eq('org_id', orgId).in('job_id', jobIds)
      for (const p of (plans ?? []) as Array<{ id: string; pending_meta: Record<string, unknown> | null }>) {
        const meta = p.pending_meta
        if (meta?.status === 'pending' && meta.approver_user_id === fromUserId) {
          const { error } = await sb.from('interview_plans').update({ pending_meta: { ...meta, approver_user_id: toUserId, approver_source: 'assigned' } }).eq('id', p.id)
          if (!error) out.plan_approvals++
        }
      }
    }

    // Pending approval steps naming the old HM, on this requisition, its changes, and its jobs.
    const { data: crs } = await sb.from('opening_change_requests').select('id').eq('opening_id', openingId).eq('status', 'pending')
    const targetIds = [openingId, ...jobIds, ...((crs ?? []) as Array<{ id: string }>).map(c => c.id)]
    const { data: approvals } = await sb.from('approvals').select('id').eq('org_id', orgId).eq('status', 'pending').in('target_id', targetIds)
    const approvalIds = ((approvals ?? []) as Array<{ id: string }>).map(a => a.id)
    if (approvalIds.length) {
      const { data: steps } = await sb.from('approval_steps').select('id, approvers').in('approval_id', approvalIds).eq('status', 'pending')
      for (const s of (steps ?? []) as Array<{ id: string; approvers: Array<{ user_id: string }> }>) {
        if (!(s.approvers ?? []).some(a => a.user_id === fromUserId)) continue
        const approvers = s.approvers.map(a => a.user_id === fromUserId ? { ...a, user_id: toUserId } : a)
        const { error } = await sb.from('approval_steps').update({ approvers }).eq('id', s.id)
        if (!error) out.approval_steps++
      }
    }
  } catch (e) {
    logger.warn('[roles] reassign in-flight failed', { openingId, e })
  }
  return out
}
