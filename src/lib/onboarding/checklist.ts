/**
 * Server-only: live "done" detection + notification sync for the first-run
 * checklist. Pairs with the client-safe metadata in `checklist-steps.ts`.
 *
 * "Done" is computed fresh from real data every call (so it can never drift
 * from reality); nothing about progress is stored. The only persistence is the
 * per-step notifications, which we reconcile (create one nudge per still-open
 * step, mark a step's nudge read once it's done).
 */

import { createAdminClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/api/notify'
import {
  deriveSteps,
  type OnboardingSignals,
  type OnboardingStepState,
} from './checklist-steps'

const NOTIF_TYPE = 'system'
const NOTIF_RESOURCE = 'onboarding'

export interface ChecklistResult {
  steps:          OnboardingStepState[]
  completedCount: number
  totalCount:     number
  complete:       boolean
}

/** Read the eight setup signals for an org (+ the calling user's calendar). */
async function gatherSignals(orgId: string, userId: string): Promise<OnboardingSignals> {
  // Canonical tables (jobs/openings) aren't all in the generated types; mirror
  // the `as any` casting used across the requisition domain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any
  const head = { count: 'exact' as const, head: true }

  const [dept, loc, reqChain, jobChain, reqs, openJobs, members, calendar] = await Promise.all([
    sb.from('departments').select('id', head).eq('org_id', orgId),
    sb.from('locations').select('id', head).eq('org_id', orgId),
    sb.from('approval_chains').select('id', head).eq('org_id', orgId).eq('target_type', 'opening').eq('is_active', true),
    sb.from('approval_chains').select('id', head).eq('org_id', orgId).eq('target_type', 'job').eq('is_active', true),
    sb.from('openings').select('id', head).eq('org_id', orgId),
    sb.from('jobs').select('id', head).eq('org_id', orgId).eq('status', 'open'),
    sb.from('org_members').select('id', head).eq('org_id', orgId).eq('is_active', true),
    sb.from('user_integrations').select('id', head).eq('user_id', userId).in('provider', ['google', 'microsoft']),
  ])

  const n = (r: { count: number | null }) => r.count ?? 0
  return {
    hasDepartment:       n(dept) > 0,
    hasLocation:         n(loc) > 0,
    hasRequisitionChain: n(reqChain) > 0,
    hasJobChain:         n(jobChain) > 0,
    hasRequisition:      n(reqs) > 0,
    hasOpenJob:          n(openJobs) > 0,
    hasTeammate:         n(members) > 1,   // >1: the creator is member #1
    hasCalendar:         n(calendar) > 0,
  }
}

export async function computeChecklist(orgId: string, userId: string, isAdmin: boolean): Promise<ChecklistResult> {
  const signals = await gatherSignals(orgId, userId)
  const steps = deriveSteps(signals, isAdmin)
  const completedCount = steps.filter(s => s.done).length
  return {
    steps,
    completedCount,
    totalCount: steps.length,
    complete: steps.length > 0 && completedCount === steps.length,
  }
}

/**
 * Reconcile one in-app notification per incomplete step (for the steps THIS
 * user sees): create a nudge for a still-open step that has none, and mark a
 * step's nudge read once it's done. Idempotent — safe to call on every load.
 */
export async function syncOnboardingNotifications(
  orgId: string,
  userId: string,
  steps: OnboardingStepState[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any
  const { data: existing } = await sb
    .from('notifications')
    .select('id, resource_id, read')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('type', NOTIF_TYPE)
    .eq('resource_type', NOTIF_RESOURCE)

  const byKey = new Map<string, { id: string; read: boolean }>()
  for (const row of (existing ?? []) as Array<{ id: string; resource_id: string; read: boolean }>) {
    byKey.set(row.resource_id, { id: row.id, read: row.read })
  }

  const toMarkRead: string[] = []
  for (const step of steps) {
    const ex = byKey.get(step.key)
    if (!step.done && !ex) {
      await createNotification({
        orgId,
        userId,
        type: NOTIF_TYPE,
        title: `Finish setup: ${step.label}`,
        body: step.description,
        resourceType: NOTIF_RESOURCE,
        resourceId: step.key,
      })
    } else if (step.done && ex && !ex.read) {
      toMarkRead.push(ex.id)
    }
  }

  if (toMarkRead.length > 0) {
    await sb.from('notifications').update({ read: true }).in('id', toMarkRead)
  }
}
