/**
 * Approval engine — Phase F: sequential only.
 *
 * The engine is a small set of pure-ish functions over the approvals tables.
 * Phase G layers parallel + conditional execution on top of these primitives.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { selectChain } from './chain-selector'
import { resolveApprovers } from './approver-resolver'
import { evaluateCondition } from './condition'
import { writeAudit } from './audit'
import type {
  ApprovalChainStep,
  ApprovalStep,
  ApprovalTargetType,
} from '@/lib/types/approvals'

export class ApprovalError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ApprovalError'
    this.status = status
  }
}

interface SubmitInput {
  orgId:       string
  targetType:  ApprovalTargetType
  targetId:    string
  target:      Record<string, unknown>     // the full target row used for condition eval
  requesterId: string
}

export interface SubmitResult {
  approvalId:        string
  currentStepIndex:  number
  status:            'pending' | 'approved' | 'rejected' | 'cancelled'
  autoApproved:      boolean                // requester == only resolved approver
}

/**
 * Submit a target for approval.
 *  - Picks the chain via ChainSelector
 *  - Materializes one approval row + N approval_steps
 *  - Evaluates each step's condition (true/null → 'pending', false → 'not_applicable')
 *  - Resolves approvers for the first applicable step and activates it
 *  - If the requester is the only resolved approver, auto-approves the step
 *    (per per-org "auto-approve when requester is approver" rule — default on)
 */
export async function submitForApproval(input: SubmitInput): Promise<SubmitResult> {
  const supabase = createAdminClient()

  // Chain selection
  const chain = await selectChain(input.orgId, input.targetType, input.target)
  if (!chain) {
    throw new ApprovalError('No approval chain matches this target. Configure a chain in Settings.', 422)
  }

  // Pull steps
  const { data: stepsRaw } = await supabase
    .from('approval_chain_steps')
    .select('*')
    .eq('chain_id', chain.id)
    .order('step_index', { ascending: true })
  const chainSteps = (stepsRaw ?? []) as ApprovalChainStep[]
  if (chainSteps.length === 0) {
    throw new ApprovalError('Approval chain has no steps. Edit it in Settings.', 422)
  }

  // Create approval row (partial unique index on (target_type, target_id) WHERE status=pending
  // enforces "only one active approval per target" — we surface that as 409).
  const { data: created, error: createErr } = await supabase
    .from('approvals')
    .insert({
      org_id:            input.orgId,
      approval_chain_id: chain.id,
      target_type:       input.targetType,
      target_id:         input.targetId,
      status:            'pending',
      current_step_index: 0,
      requested_by:      input.requesterId,
    })
    .select('id')
    .single()
  if (createErr || !created) {
    if ((createErr?.code ?? '') === '23505') {
      throw new ApprovalError('An approval is already pending for this target.', 409)
    }
    throw new ApprovalError(createErr?.message ?? 'Failed to create approval', 500)
  }
  const approvalId = (created as { id: string }).id

  // Materialize step rows. Conditions evaluated NOW; non-applicable steps marked
  // up front so the engine can skip them deterministically.
  const stepInserts = chainSteps.map(s => ({
    approval_id:       approvalId,
    chain_step_id:     s.id,
    step_index:        s.step_index,
    parallel_group_id: s.parallel_group_id,
    status:            evaluateCondition(s.condition ?? null, input.target) ? 'pending' : 'not_applicable',
    approvers:         [],
    decisions:         [],
    min_approvals:     s.min_approvals,
    due_at:            null,
    activated_at:      null,
    completed_at:      evaluateCondition(s.condition ?? null, input.target) ? null : new Date().toISOString(),
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: stepInsertErr } = await supabase.from('approval_steps').insert(stepInserts as any)
  if (stepInsertErr) {
    throw new ApprovalError(stepInsertErr.message, 500)
  }

  await writeAudit({
    org_id:        input.orgId,
    approval_id:   approvalId,
    target_type:   input.targetType,
    target_id:     input.targetId,
    actor_user_id: input.requesterId,
    action:        'submitted',
    from_state:    'draft',
    to_state:      'pending',
    metadata:      { chain_id: chain.id },
  })

  // Activate the first applicable step (and walk it forward if auto-approval applies).
  const result = await activateNextStep(approvalId, input.requesterId)
  return result
}

/**
 * Activate the next pending step (in step_index order).
 * If the only resolved approver is the original requester, auto-approve and recurse.
 * Returns the final state after walking auto-approves.
 */
async function activateNextStep(approvalId: string, requesterId: string): Promise<SubmitResult> {
  const supabase = createAdminClient()

  const { data: approvalRow } = await supabase
    .from('approvals')
    .select('id, org_id, target_type, target_id, status, current_step_index')
    .eq('id', approvalId)
    .single()
  const approval = approvalRow as {
    id: string; org_id: string; target_type: ApprovalTargetType; target_id: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'; current_step_index: number;
  }

  if (approval.status !== 'pending') {
    return { approvalId, currentStepIndex: approval.current_step_index, status: approval.status, autoApproved: false }
  }

  // Find the next non-not_applicable, non-completed step.
  const { data: stepsRaw } = await supabase
    .from('approval_steps')
    .select('id, step_index, status, chain_step_id')
    .eq('approval_id', approvalId)
    .order('step_index', { ascending: true })
  const steps = (stepsRaw ?? []) as Pick<ApprovalStep, 'id' | 'step_index' | 'status' | 'chain_step_id'>[]
  const next = steps.find(s => s.status === 'pending' && (s as { activated_at?: string | null }).activated_at == null)
    ?? steps.find(s => s.status === 'pending')

  if (!next) {
    // No more pending steps — approval complete.
    await supabase
      .from('approvals')
      .update({ status: 'approved', completed_at: new Date().toISOString() })
      .eq('id', approvalId)
    await writeAudit({
      org_id: approval.org_id, approval_id: approvalId,
      target_type: approval.target_type, target_id: approval.target_id,
      action: 'approved', to_state: 'approved',
    })
    await applyApprovedToTarget(approval.target_type, approval.target_id)
    return { approvalId, currentStepIndex: approval.current_step_index, status: 'approved', autoApproved: false }
  }

  // Resolve approvers + activate.
  const { data: chainStepRaw } = await supabase
    .from('approval_chain_steps')
    .select('approver_type, approver_value, sla_hours, name, min_approvals')
    .eq('id', next.chain_step_id)
    .single()
  const chainStep = chainStepRaw as Pick<ApprovalChainStep, 'approver_type' | 'approver_value' | 'sla_hours' | 'name' | 'min_approvals'>

  const approvers = await resolveApprovers(chainStep.approver_type, chainStep.approver_value, {
    orgId: approval.org_id, targetType: approval.target_type, targetId: approval.target_id,
  })

  const due = chainStep.sla_hours ? new Date(Date.now() + chainStep.sla_hours * 3600 * 1000).toISOString() : null

  await supabase
    .from('approval_steps')
    .update({ approvers, activated_at: new Date().toISOString(), due_at: due })
    .eq('id', next.id)

  await supabase
    .from('approvals')
    .update({ current_step_index: next.step_index })
    .eq('id', approvalId)

  await writeAudit({
    org_id: approval.org_id, approval_id: approvalId,
    target_type: approval.target_type, target_id: approval.target_id,
    action: 'step_activated',
    metadata: { step_index: next.step_index, name: chainStep.name, approvers: approvers.map(a => a.user_id) },
  })

  // Auto-approve if the requester is among the approvers AND only one approval is needed.
  // Per-org config could turn this off later; default on per the prompt.
  const requesterIsApprover = approvers.some(a => a.user_id === requesterId)
  if (requesterIsApprover && chainStep.min_approvals === 1) {
    const completedAt = new Date().toISOString()
    await supabase
      .from('approval_steps')
      .update({
        status: 'approved',
        decisions: [{ user_id: requesterId, decision: 'approved', comment: 'Auto-approved (requester is approver).', at: completedAt }],
        completed_at: completedAt,
      })
      .eq('id', next.id)
    await writeAudit({
      org_id: approval.org_id, approval_id: approvalId,
      target_type: approval.target_type, target_id: approval.target_id,
      actor_user_id: requesterId,
      action: 'auto_approved',
      metadata: { step_index: next.step_index },
    })
    return await activateNextStep(approvalId, requesterId)
  }

  return { approvalId, currentStepIndex: next.step_index, status: 'pending', autoApproved: false }
}

/**
 * Record a decision on an active approval step.
 * Approve: if min_approvals reached, complete step and advance.
 * Reject: fail the entire approval; target → 'draft'.
 */
export async function decideOnStep(input: {
  approvalId:    string
  stepId:        string
  userId:        string
  decision:      'approved' | 'rejected'
  comment:       string | null
}): Promise<{ status: 'pending' | 'approved' | 'rejected' | 'cancelled' }> {
  const supabase = createAdminClient()

  const { data: stepRaw } = await supabase
    .from('approval_steps')
    .select('id, approval_id, step_index, status, approvers, decisions, min_approvals, activated_at, completed_at')
    .eq('id', input.stepId)
    .eq('approval_id', input.approvalId)
    .single()
  const step = stepRaw as ApprovalStep | null
  if (!step) throw new ApprovalError('Step not found', 404)
  if (step.status !== 'pending' || step.activated_at == null) {
    throw new ApprovalError('Step is not awaiting a decision', 409)
  }
  if (!step.approvers.some(a => a.user_id === input.userId)) {
    throw new ApprovalError('You are not an approver on this step', 403)
  }
  if (step.decisions.some(d => d.user_id === input.userId)) {
    throw new ApprovalError('You have already decided on this step', 409)
  }

  const { data: approvalRaw } = await supabase
    .from('approvals')
    .select('id, org_id, target_type, target_id, requested_by, status')
    .eq('id', input.approvalId)
    .single()
  const approval = approvalRaw as {
    id: string; org_id: string; target_type: ApprovalTargetType; target_id: string;
    requested_by: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  }
  if (approval.status !== 'pending') throw new ApprovalError('Approval is not pending', 409)

  const now = new Date().toISOString()
  const newDecisions = [...step.decisions, { user_id: input.userId, decision: input.decision, comment: input.comment, at: now }]

  if (input.decision === 'rejected') {
    await supabase.from('approval_steps')
      .update({ status: 'rejected', decisions: newDecisions, completed_at: now })
      .eq('id', step.id)
    await supabase.from('approvals')
      .update({ status: 'rejected', completed_at: now })
      .eq('id', approval.id)
    await writeAudit({
      org_id: approval.org_id, approval_id: approval.id,
      target_type: approval.target_type, target_id: approval.target_id,
      actor_user_id: input.userId,
      action: 'rejected', to_state: 'rejected',
      metadata: { step_index: step.step_index, comment: input.comment },
    })
    await applyRejectedToTarget(approval.target_type, approval.target_id)
    return { status: 'rejected' }
  }

  // Approve. Have we hit min_approvals?
  const approvedCount = newDecisions.filter(d => d.decision === 'approved').length
  if (approvedCount >= step.min_approvals) {
    await supabase.from('approval_steps')
      .update({ status: 'approved', decisions: newDecisions, completed_at: now })
      .eq('id', step.id)
    await writeAudit({
      org_id: approval.org_id, approval_id: approval.id,
      target_type: approval.target_type, target_id: approval.target_id,
      actor_user_id: input.userId,
      action: 'step_decided',
      metadata: { step_index: step.step_index, decision: 'approved', comment: input.comment },
    })
    const result = await activateNextStep(approval.id, approval.requested_by)
    return { status: result.status }
  }

  // Not enough yet — record but stay pending.
  await supabase.from('approval_steps')
    .update({ decisions: newDecisions })
    .eq('id', step.id)
  await writeAudit({
    org_id: approval.org_id, approval_id: approval.id,
    target_type: approval.target_type, target_id: approval.target_id,
    actor_user_id: input.userId,
    action: 'step_decided',
    metadata: { step_index: step.step_index, decision: 'approved', partial: true, comment: input.comment },
  })
  return { status: 'pending' }
}

/** Requester cancels an in-flight approval. */
export async function cancelApproval(approvalId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data: approvalRaw } = await supabase
    .from('approvals')
    .select('id, org_id, target_type, target_id, requested_by, status')
    .eq('id', approvalId)
    .single()
  const approval = approvalRaw as {
    id: string; org_id: string; target_type: ApprovalTargetType; target_id: string;
    requested_by: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  } | null
  if (!approval) throw new ApprovalError('Approval not found', 404)
  if (approval.requested_by !== userId) throw new ApprovalError('Only the requester can cancel.', 403)
  if (approval.status !== 'pending') throw new ApprovalError('Approval is not active.', 409)

  const now = new Date().toISOString()
  await supabase.from('approvals').update({ status: 'cancelled', completed_at: now }).eq('id', approval.id)
  await writeAudit({
    org_id: approval.org_id, approval_id: approval.id,
    target_type: approval.target_type, target_id: approval.target_id,
    actor_user_id: userId, action: 'cancelled', to_state: 'cancelled',
  })
  await applyDraftToTarget(approval.target_type, approval.target_id)
}

// ── Target status updates ────────────────────────────────────────────

async function applyApprovedToTarget(targetType: ApprovalTargetType, targetId: string): Promise<void> {
  const supabase = createAdminClient()
  if (targetType === 'opening') {
    await supabase.from('openings').update({ status: 'approved' }).eq('id', targetId)
  } else if (targetType === 'job') {
    await supabase.from('jobs').update({ status: 'approved' }).eq('id', targetId)
  }
}
async function applyRejectedToTarget(targetType: ApprovalTargetType, targetId: string): Promise<void> {
  const supabase = createAdminClient()
  if (targetType === 'opening') {
    await supabase.from('openings').update({ status: 'draft', approval_id: null }).eq('id', targetId)
  } else if (targetType === 'job') {
    await supabase.from('jobs').update({ status: 'draft', approval_id: null }).eq('id', targetId)
  }
}
async function applyDraftToTarget(targetType: ApprovalTargetType, targetId: string): Promise<void> {
  const supabase = createAdminClient()
  if (targetType === 'opening') {
    await supabase.from('openings').update({ status: 'draft', approval_id: null }).eq('id', targetId)
  } else if (targetType === 'job') {
    await supabase.from('jobs').update({ status: 'draft', approval_id: null }).eq('id', targetId)
  }
}
