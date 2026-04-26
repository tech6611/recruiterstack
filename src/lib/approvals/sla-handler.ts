/**
 * Job-queue handler for `approval_sla_check`. Enqueued at step activation
 * with scheduled_at = due_at; fires when the time arrives.
 *
 * Behavior:
 *  - Re-fetch the step. If it's no longer pending OR SLA was already notified,
 *    no-op (the decision happened in time, or another worker beat us).
 *  - Otherwise, fire approver/requester escalation emails + Slack pings,
 *    then stamp sla_breach_notified_at so we don't re-fire.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { writeAudit } from './audit'
import { notifySlaBreach } from './notifications'
import type { QueuedJob } from '@/lib/api/job-queue'
import type { ApprovalTargetType } from '@/lib/types/approvals'

interface Payload {
  org_id:      string
  approval_id: string
  step_id:     string
}

export async function handleSlaCheck(job: QueuedJob): Promise<void> {
  const payload = job.payload as unknown as Payload
  const supabase = createAdminClient()

  const { data: stepRow } = await supabase
    .from('approval_steps')
    .select('id, approval_id, step_index, status, approvers, due_at, sla_breach_notified_at, chain_step_id')
    .eq('id', payload.step_id)
    .maybeSingle()
  const step = stepRow as {
    id: string; approval_id: string; step_index: number; status: string;
    approvers: Array<{ user_id: string }>; due_at: string | null;
    sla_breach_notified_at: string | null; chain_step_id: string;
  } | null
  if (!step) return
  if (step.status !== 'pending') return                  // already decided
  if (step.sla_breach_notified_at) return                 // already notified
  if (!step.due_at || new Date(step.due_at).getTime() > Date.now()) return  // not yet overdue

  const { data: approval } = await supabase
    .from('approvals')
    .select('org_id, target_type, target_id, requested_by, status')
    .eq('id', step.approval_id)
    .maybeSingle()
  const a = approval as {
    org_id: string; target_type: ApprovalTargetType; target_id: string;
    requested_by: string; status: string;
  } | null
  if (!a || a.status !== 'pending') return

  const { data: cs } = await supabase
    .from('approval_chain_steps')
    .select('name')
    .eq('id', step.chain_step_id)
    .maybeSingle()
  const stepName = (cs as { name: string } | null)?.name ?? `Step ${step.step_index + 1}`

  await notifySlaBreach({
    orgId: a.org_id,
    stepName,
    approverIds: step.approvers.map(x => x.user_id),
    requesterId: a.requested_by,
    targetType: a.target_type, targetId: a.target_id,
    dueAt: step.due_at,
  })

  await supabase
    .from('approval_steps')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ sla_breach_notified_at: new Date().toISOString() } as any)
    .eq('id', step.id)

  await writeAudit({
    org_id: a.org_id, approval_id: step.approval_id,
    target_type: a.target_type, target_id: a.target_id,
    action: 'sla_breach',
    metadata: { step_index: step.step_index, due_at: step.due_at },
  })
}
