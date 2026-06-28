/**
 * Re-approval gate for edits to an already-approved job.
 *
 * When someone edits a job that carries an approved baseline (status approved /
 * open / paused), we compare the new content against the snapshot the approval
 * was granted against. A pure formatting change passes silently. A genuine
 * WORDING change to the JD or key intake fields means the live posting no longer
 * matches what was signed off, so we re-run the approval workflow:
 *
 *   - Sole approver (auto-approve): the re-approval clears instantly and we
 *     restore the prior live state — the edit is seamless.
 *   - A real second approver exists: the job drops to `pending_approval` (off the
 *     market) until they re-approve, and the engine notifies them automatically.
 *
 * If no approval chain applies, we don't block the edit — it's applied and we
 * flag that re-approval couldn't be routed.
 */

import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'
import { writeAudit } from '@/lib/approvals/audit'
import { logger } from '@/lib/logger'
import {
  extractSubstance,
  diffSubstance,
  substanceLabels,
  type ApprovedSnapshot,
} from '@/lib/jobs/substance'

// States that carry an approved baseline (an edit here may need re-approval).
const BASELINED_STATES = ['approved', 'open', 'paused']

export interface ReapprovalOutcome {
  reapproval:          boolean   // did a material change trigger re-approval?
  changed_fields:      string[]  // human labels of the changed substance fields
  auto_approved?:      boolean   // re-approval cleared instantly (sole approver)
  reapproval_skipped?: boolean   // material change but no approval chain applied
  status?:             string    // resulting job status
}

const NO_CHANGE: ReapprovalOutcome = { reapproval: false, changed_fields: [] }

/**
 * @param job  the freshly-updated job row (id, status, description, custom_fields, approved_snapshot)
 * @param priorStatus  the job's status BEFORE this edit
 */
export async function maybeTriggerReapproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: any,
  priorStatus: string,
): Promise<ReapprovalOutcome> {
  if (!BASELINED_STATES.includes(priorStatus)) return NO_CHANGE

  const snapshot = (job?.approved_snapshot ?? null) as ApprovedSnapshot | null
  if (!snapshot?.substance) return NO_CHANGE // no baseline to compare against

  const changed = diffSubstance(snapshot.substance, extractSubstance(job))
  if (changed.length === 0) return NO_CHANGE // formatting-only or unrelated edit

  const labels = substanceLabels(changed)
  try {
    const result = await submitForApproval({
      orgId,
      targetType:  'job',
      targetId:    job.id,
      target:      job,
      requesterId: userId,
    })
    const autoApproved = result.status === 'approved'
    // Auto-approved → restore the prior live state (seamless). Needs a real
    // approver → take the job offline until re-approved.
    const newStatus = autoApproved ? priorStatus : 'pending_approval'
    await supabase
      .from('jobs')
      .update({ status: newStatus, approval_id: result.approvalId })
      .eq('id', job.id)
      .eq('org_id', orgId)

    await writeAudit({
      org_id:        orgId,
      approval_id:   result.approvalId,
      target_type:   'job',
      target_id:     job.id,
      actor_user_id: userId,
      action:        'substance_edited',
      from_state:    priorStatus,
      to_state:      newStatus,
      metadata:      { changed_fields: changed, auto_approved: autoApproved },
    })

    return { reapproval: true, changed_fields: labels, auto_approved: autoApproved, status: newStatus }
  } catch (e) {
    // No matching chain / approval misconfig — apply the edit without blocking.
    if (e instanceof ApprovalError) logger.warn('[reapproval] skipped: ' + e.message)
    else logger.error('[reapproval] unexpected error', e)
    return { reapproval: false, changed_fields: labels, reapproval_skipped: true, status: priorStatus }
  }
}
