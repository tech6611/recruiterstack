/**
 * Approval-event notifications: email + Slack DM, plus rich Block Kit messages
 * for approver pings (Approve/Reject buttons handled by /api/slack/interactions).
 *
 * All entry points are best-effort — they swallow errors via the logger and
 * never throw, because business state transitions in the engine must commit
 * regardless of notification reachability.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { decryptSafe } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/email/send'
import {
  renderApprovalRequested,
  renderApprovalStepDecided,
  renderApprovalCompleted,
  renderApprovalSlaBreach,
} from '@/lib/email/templates'
import { notifySlackDM } from '@/lib/notifications'
import type { ApprovalTargetType } from '@/lib/types/approvals'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://recruiterstack.in'

interface UserLite {
  id:        string
  email:     string
  full_name: string | null
}

async function getUsers(ids: string[]): Promise<UserLite[]> {
  if (ids.length === 0) return []
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('users')
    .select('id, email, full_name')
    .in('id', ids)
  return (data ?? []) as UserLite[]
}

async function getTargetTitle(targetType: ApprovalTargetType, targetId: string): Promise<string> {
  const supabase = createAdminClient()
  if (targetType === 'opening') {
    const { data } = await supabase.from('openings').select('title').eq('id', targetId).maybeSingle()
    return (data as { title: string } | null)?.title ?? 'Opening'
  }
  if (targetType === 'job') {
    const { data } = await supabase.from('jobs').select('title').eq('id', targetId).maybeSingle()
    return (data as { title: string } | null)?.title ?? 'Job'
  }
  return 'Offer'
}

async function hasSlackInstalled(orgId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_bot_token')
    .eq('org_id', orgId)
    .maybeSingle()
  return !!decryptSafe((data as { slack_bot_token: string | null } | null)?.slack_bot_token ?? null)
}

// ── Slack interactive message (Block Kit) ──────────────────────────

async function sendSlackApprovalRequest(
  orgId: string,
  email: string,
  approvalId: string,
  stepId: string,
  targetTitle: string,
  stepName: string,
  requesterName: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_bot_token')
    .eq('org_id', orgId)
    .maybeSingle()
  const token = decryptSafe((data as { slack_bot_token: string | null } | null)?.slack_bot_token ?? null)
  if (!token || !email) return

  try {
    const userRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const userData = await userRes.json()
    if (!userData.ok || !userData.user?.id) return

    // value is parsed by /api/slack/interactions; encode the IDs we need.
    const value = `${approvalId}::${stepId}`
    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn',
          text: `*Approval requested*\n${requesterName} needs your decision on *${escapeMd(targetTitle)}* (step: ${escapeMd(stepName)}).` },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ Approve' },
            style: 'primary', action_id: 'approval_approve', value },
          { type: 'button', text: { type: 'plain_text', text: '❌ Reject' },
            style: 'danger', action_id: 'approval_reject', value },
          { type: 'button', text: { type: 'plain_text', text: 'Open in app' },
            url: `${APP_URL()}/approvals/inbox`, action_id: 'approval_open' },
        ],
      },
    ]

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: userData.user.id,
        text: `Approval requested: ${targetTitle}`,
        blocks,
      }),
    })
  } catch (err) {
    logger.error('[slack-interactive] send failed', err, { orgId, email })
  }
}

function escapeMd(s: string): string {
  return s.replace(/[*_`>]/g, c => `\\${c}`)
}

// ── Public API used by the engine ──────────────────────────────────

export async function notifyStepActivated(input: {
  orgId:         string
  approvalId:    string
  stepId:        string
  stepName:      string
  approverIds:   string[]
  requesterId:   string
  targetType:    ApprovalTargetType
  targetId:      string
  dueAt:         string | null
}): Promise<void> {
  try {
    const [approvers, requester, slackOn] = await Promise.all([
      getUsers(input.approverIds),
      getUsers([input.requesterId]).then(u => u[0]),
      hasSlackInstalled(input.orgId),
    ])
    const targetTitle = await getTargetTitle(input.targetType, input.targetId)
    const requesterName = requester?.full_name ?? requester?.email ?? 'A teammate'

    for (const a of approvers) {
      const tpl = renderApprovalRequested({
        appUrl: APP_URL(), targetTitle, targetType: input.targetType, targetId: input.targetId,
        approverName: a.full_name ?? a.email, requesterName,
        stepName: input.stepName, approvalId: input.approvalId, stepId: input.stepId,
        dueAt: input.dueAt,
      })
      await sendEmail({ to: a.email, subject: tpl.subject, html: tpl.html })
      if (slackOn) {
        await sendSlackApprovalRequest(
          input.orgId, a.email, input.approvalId, input.stepId,
          targetTitle, input.stepName, requesterName,
        )
      }
    }
  } catch (err) {
    logger.error('[notify] step_activated failed', err)
  }
}

export async function notifyStepDecided(input: {
  orgId:        string
  decision:     'approved' | 'rejected'
  stepName:     string
  approverId:   string
  comment:      string | null
  requesterId:  string
  targetType:   ApprovalTargetType
  targetId:     string
}): Promise<void> {
  try {
    const [requester, approver, slackOn] = await Promise.all([
      getUsers([input.requesterId]).then(u => u[0]),
      getUsers([input.approverId]).then(u => u[0]),
      hasSlackInstalled(input.orgId),
    ])
    if (!requester) return
    const targetTitle = await getTargetTitle(input.targetType, input.targetId)
    const tpl = renderApprovalStepDecided({
      appUrl: APP_URL(), targetTitle, targetType: input.targetType, targetId: input.targetId,
      requesterName: requester.full_name ?? requester.email,
      approverName: approver?.full_name ?? approver?.email ?? 'An approver',
      stepName: input.stepName, decision: input.decision, comment: input.comment,
    })
    await sendEmail({ to: requester.email, subject: tpl.subject, html: tpl.html })
    if (slackOn) {
      const verb = input.decision === 'approved' ? 'approved' : 'rejected'
      const msg = `${approver?.full_name ?? approver?.email ?? 'An approver'} ${verb} the *${input.stepName}* step on *${targetTitle}*.${input.comment ? `\n> ${input.comment}` : ''}`
      await notifySlackDM(input.orgId, requester.email, msg)
    }
  } catch (err) {
    logger.error('[notify] step_decided failed', err)
  }
}

export async function notifyApprovalCompleted(input: {
  orgId:        string
  requesterId:  string
  targetType:   ApprovalTargetType
  targetId:     string
}): Promise<void> {
  try {
    const requester = (await getUsers([input.requesterId]))[0]
    if (!requester) return
    const targetTitle = await getTargetTitle(input.targetType, input.targetId)
    const tpl = renderApprovalCompleted({
      appUrl: APP_URL(), targetTitle, targetType: input.targetType, targetId: input.targetId,
      requesterName: requester.full_name ?? requester.email,
    })
    await sendEmail({ to: requester.email, subject: tpl.subject, html: tpl.html })
    if (await hasSlackInstalled(input.orgId)) {
      await notifySlackDM(input.orgId, requester.email, `🎉 Your approval for *${targetTitle}* completed — all steps approved.`)
    }
  } catch (err) {
    logger.error('[notify] completed failed', err)
  }
}

export async function notifySlaBreach(input: {
  orgId:         string
  stepName:      string
  approverIds:   string[]
  requesterId:   string
  targetType:    ApprovalTargetType
  targetId:      string
  dueAt:         string
}): Promise<void> {
  try {
    const [approvers, requester] = await Promise.all([
      getUsers(input.approverIds),
      getUsers([input.requesterId]).then(u => u[0]),
    ])
    const targetTitle = await getTargetTitle(input.targetType, input.targetId)
    const slackOn = await hasSlackInstalled(input.orgId)

    // Approver(s)
    for (const a of approvers) {
      const tpl = renderApprovalSlaBreach({
        appUrl: APP_URL(), targetTitle, targetType: input.targetType, targetId: input.targetId,
        recipientName: a.full_name ?? a.email,
        recipientRole: 'approver',
        approverName: a.full_name ?? a.email,
        stepName: input.stepName, dueAt: input.dueAt,
      })
      await sendEmail({ to: a.email, subject: tpl.subject, html: tpl.html })
      if (slackOn) {
        await notifySlackDM(input.orgId, a.email, `⏰ Reminder: *${targetTitle}* (${input.stepName}) is past its SLA. Please decide.`)
      }
    }
    // Requester
    if (requester) {
      const tpl = renderApprovalSlaBreach({
        appUrl: APP_URL(), targetTitle, targetType: input.targetType, targetId: input.targetId,
        recipientName: requester.full_name ?? requester.email,
        recipientRole: 'requester',
        approverName: approvers[0]?.full_name ?? approvers[0]?.email ?? 'an approver',
        stepName: input.stepName, dueAt: input.dueAt,
      })
      await sendEmail({ to: requester.email, subject: tpl.subject, html: tpl.html })
    }
  } catch (err) {
    logger.error('[notify] sla_breach failed', err)
  }
}
