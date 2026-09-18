import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { filterReachableApprovers } from '@/lib/approvals/reachability'
import { writeAudit } from '@/lib/approvals/audit'
import { mintStepTokens } from '@/lib/approvals/tokens'
import { notifyStepActivated } from '@/lib/approvals/notifications'
import { logger } from '@/lib/logger'
import type { ApprovalTargetType } from '@/lib/types/approvals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const bodySchema = z.object({ user_ids: z.array(z.string().uuid()).min(1).max(10) })

/**
 * POST — reassign a pending approval step to people who can actually act (active
 * members with a live login). For steps left with no approver after a member left,
 * or after a chain named someone who can't sign in. Admin-level capability.
 */
export const POST = withCapability('settings:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    const sb = supabase as unknown as LooseSb
    const [{ data: approval }, { data: step }] = await Promise.all([
      sb.from('approvals').select('id, org_id, status, target_type, target_id, requested_by').eq('id', params.id).eq('org_id', orgId).maybeSingle(),
      sb.from('approval_steps').select('id, approval_id, status, chain_step_id, activated_at, due_at').eq('id', params.step_id).eq('approval_id', params.id).maybeSingle(),
    ])
    if (!approval || !step) return NextResponse.json({ error: 'Approval step not found' }, { status: 404 })
    if (approval.status !== 'pending' || step.status !== 'pending') return NextResponse.json({ error: 'Only pending steps can be reassigned' }, { status: 409 })

    const { reachable, dropped } = await filterReachableApprovers(supabase, orgId, body.user_ids)
    if (!reachable.length) {
      return NextResponse.json({ error: 'None of those people can act in this workspace (not an active member, or no live login).', dropped }, { status: 422 })
    }
    const approvers = reachable.map((user_id) => ({ user_id }))
    const now = new Date().toISOString()
    const { error } = await sb.from('approval_steps').update({ approvers, activated_at: step.activated_at ?? now }).eq('id', step.id)
    if (error) throw error

    const { data: cs } = await sb.from('approval_chain_steps').select('name').eq('id', step.chain_step_id).maybeSingle()
    const stepName = (cs as { name?: string } | null)?.name ?? 'Approval'
    await writeAudit({
      org_id: orgId, approval_id: approval.id, target_type: approval.target_type, target_id: approval.target_id,
      actor_user_id: userId, action: 'step_reassigned',
      metadata: { step_id: step.id, name: stepName, approvers: reachable, rejected: dropped },
    })
    const tokens = await mintStepTokens(supabase, { orgId, approvalId: approval.id, stepId: step.id, userIds: reachable }).catch((e) => {
      logger.error('[reassign] mint step tokens', e)
      return {} as Record<string, string>
    })
    notifyStepActivated({
      orgId, approvalId: approval.id, stepId: step.id, stepName, approverIds: reachable, requesterId: approval.requested_by,
      targetType: approval.target_type as ApprovalTargetType, targetId: approval.target_id, dueAt: step.due_at ?? null, tokens,
    }).catch((e) => logger.error('[reassign] notify', e))

    return NextResponse.json({ data: { step_id: step.id, approvers: reachable, not_reachable: dropped } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
