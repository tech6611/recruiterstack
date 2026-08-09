/**
 * Slack interaction handlers for the offer/requisition approvals flow.
 *
 * Extracted verbatim (behavior-preserving) from the old hard-wired
 * /api/slack/interactions route so approvals now run through the generic
 * dispatcher in ../actions.ts. The button `value` convention is unchanged:
 * `${approvalId}::${stepId}`, produced by lib/approvals/notifications.ts.
 */

import { NextResponse } from 'next/server'
import { decideOnStep, ApprovalError } from '@/lib/approvals/engine'
import { chatUpdate, viewsOpen } from '@/lib/slack/client'
import { logger } from '@/lib/logger'
import type { BlockActionContext, ViewSubmissionContext } from '@/lib/slack/actions'

/** Approve button → record the decision, then replace the DM with an ack. */
export async function approvalApprove(ctx: BlockActionContext): Promise<NextResponse> {
  const [approvalId, stepId] = ctx.action.value.split('::')
  if (!approvalId || !stepId) return NextResponse.json({})

  try {
    await decideOnStep({ approvalId, stepId, userId: ctx.userId, decision: 'approved', comment: null })
  } catch (err) {
    if (err instanceof ApprovalError) {
      logger.warn('[slack-interactions] approve rejected', { error: err.message, approvalId })
    } else {
      logger.error('[slack-interactions] approve threw', err)
    }
  }

  if (ctx.channelId && ctx.messageTs) {
    await chatUpdate(ctx.orgId, {
      channel: ctx.channelId, ts: ctx.messageTs, text: `✅ Approved by <@${ctx.slackUserId}>`,
    })
  }
  return NextResponse.json({})
}

/** Reject button → open a modal asking for the reason. */
export async function approvalReject(ctx: BlockActionContext): Promise<NextResponse> {
  const [approvalId, stepId] = ctx.action.value.split('::')
  if (!approvalId || !stepId) return NextResponse.json({})

  const meta = JSON.stringify({
    approvalId, stepId, channelId: ctx.channelId, messageTs: ctx.messageTs, orgId: ctx.orgId,
  })

  // Slack requires trigger_id to be used within ~3s, so await the open.
  await viewsOpen(ctx.orgId, ctx.triggerId, {
    type: 'modal',
    callback_id: 'approval_reject_modal',
    private_metadata: meta,
    title: { type: 'plain_text', text: 'Reject approval' },
    submit: { type: 'plain_text', text: 'Reject' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'comment_block',
        label: { type: 'plain_text', text: 'Reason (≥ 20 characters)' },
        element: {
          type: 'plain_text_input',
          action_id: 'comment_input',
          multiline: true,
          min_length: 20,
          max_length: 5000,
        },
      },
    ],
  })
  return NextResponse.json({})
}

/** Reject-comment modal submit → record the rejection with the comment. */
export async function approvalRejectModalSubmit(ctx: ViewSubmissionContext): Promise<NextResponse> {
  let meta: { approvalId: string; stepId: string; channelId?: string; messageTs?: string; orgId: string }
  try {
    meta = JSON.parse(ctx.privateMetadata)
  } catch {
    return NextResponse.json({ response_action: 'errors' })
  }

  const comment = ctx.values?.comment_block?.comment_input?.value ?? ''
  if (!comment || comment.trim().length < 20) {
    return NextResponse.json({
      response_action: 'errors',
      errors: { comment_block: 'Reason must be at least 20 characters.' },
    })
  }

  try {
    await decideOnStep({
      approvalId: meta.approvalId, stepId: meta.stepId, userId: ctx.userId,
      decision: 'rejected', comment: comment.trim(),
    })
  } catch (err) {
    if (err instanceof ApprovalError) {
      logger.warn('[slack-interactions] reject failed', { error: err.message })
    } else {
      logger.error('[slack-interactions] reject threw', err)
    }
  }

  if (meta.channelId && meta.messageTs) {
    await chatUpdate(meta.orgId, {
      channel: meta.channelId, ts: meta.messageTs, text: `❌ Rejected by <@${ctx.slackUserId}>`,
    })
  }
  return NextResponse.json({ response_action: 'clear' })
}
