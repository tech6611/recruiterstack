/**
 * Slack interactivity endpoint.
 *
 * Slack POSTs here when a user:
 *   1. Clicks an Approve / Reject button on an approval-request DM
 *      → payload type "block_actions"
 *   2. Submits the reject-comment modal
 *      → payload type "view_submission"
 *
 * Approve fires decideOnStep directly. Reject opens a modal (views.open) and
 * waits for the modal submission, then calls decideOnStep with the comment.
 *
 * Every request is signature-verified. Slack requires a 200 within 3s — for
 * approve/reject we update the original message asynchronously after a fast 200.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { decryptSafe } from '@/lib/crypto'
import { verifySlackSignature } from '@/lib/slack/verify'
import { decideOnStep, ApprovalError } from '@/lib/approvals/engine'
import { logger } from '@/lib/logger'

interface SlackUser { id: string; username?: string; name?: string }
interface ButtonAction { action_id: string; value: string }
interface BlockActionsPayload {
  type: 'block_actions'
  user: SlackUser
  trigger_id: string
  actions: ButtonAction[]
  message: { ts: string; channel?: string; blocks?: unknown[] }
  channel: { id: string }
  team: { id: string }
}
interface ViewSubmissionPayload {
  type: 'view_submission'
  user: SlackUser
  view: {
    private_metadata: string
    state: { values: Record<string, Record<string, { value?: string }>> }
  }
  team: { id: string }
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const tsHeader = req.headers.get('x-slack-request-timestamp')
  const sigHeader = req.headers.get('x-slack-signature')

  if (!verifySlackSignature({ rawBody, timestamp: tsHeader, signature: sigHeader })) {
    return new NextResponse('Bad signature', { status: 401 })
  }

  // Slack interactivity sends payload as form-urlencoded with payload=<JSON>
  const params = new URLSearchParams(rawBody)
  const payloadStr = params.get('payload')
  if (!payloadStr) return new NextResponse('Missing payload', { status: 400 })

  let payload: BlockActionsPayload | ViewSubmissionPayload
  try {
    payload = JSON.parse(payloadStr)
  } catch {
    return new NextResponse('Bad payload', { status: 400 })
  }

  if (payload.type === 'block_actions') {
    return handleBlockActions(payload)
  }
  if (payload.type === 'view_submission') {
    return handleViewSubmission(payload)
  }
  return NextResponse.json({})
}

// ── helpers ───────────────────────────────────────────────────────

async function lookupSlackEmail(teamId: string, slackUserId: string): Promise<{ orgId: string; email: string } | null> {
  // Find the org that owns this Slack team install, then resolve the Slack user
  // → email via users.info using that org's bot token.
  const supabase = createAdminClient()
  const { data: org } = await supabase
    .from('org_settings')
    .select('org_id, slack_bot_token, slack_team_id')
    .eq('slack_team_id', teamId)
    .maybeSingle()
  const row = org as { org_id: string; slack_bot_token: string | null } | null
  const token = decryptSafe(row?.slack_bot_token ?? null)
  if (!row || !token) return null

  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    const email: string | undefined = body?.user?.profile?.email
    if (!email) return null
    return { orgId: row.org_id, email }
  } catch (err) {
    logger.error('[slack-interactions] users.info failed', err)
    return null
  }
}

async function ourUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function postUpdateAck(orgId: string, channelId: string, ts: string, text: string): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_bot_token')
    .eq('org_id', orgId)
    .maybeSingle()
  const token = decryptSafe((data as { slack_bot_token: string | null } | null)?.slack_bot_token ?? null)
  if (!token) return
  try {
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId, ts, text, blocks: [] }),
    })
  } catch (err) {
    logger.error('[slack-interactions] chat.update failed', err, { channelId })
  }
}

// ── block_actions: Approve or Reject button ──────────────────────

async function handleBlockActions(p: BlockActionsPayload): Promise<NextResponse> {
  const action = p.actions?.[0]
  if (!action) return NextResponse.json({})
  if (action.action_id !== 'approval_approve' && action.action_id !== 'approval_reject') {
    return NextResponse.json({})            // ignore unknown actions (e.g. "open in app")
  }

  const [approvalId, stepId] = action.value.split('::')
  if (!approvalId || !stepId) return NextResponse.json({})

  const lookup = await lookupSlackEmail(p.team.id, p.user.id)
  if (!lookup) {
    return NextResponse.json({
      response_action: 'errors',
      text: 'Could not match your Slack account to RecruiterStack.',
    })
  }

  const userId = await ourUserIdByEmail(lookup.email)
  if (!userId) return NextResponse.json({ text: 'No RecruiterStack account found.' })

  if (action.action_id === 'approval_reject') {
    // Open a modal asking for the reject comment. private_metadata carries the
    // approval/step IDs through to view_submission.
    const triggerId = p.trigger_id
    const channelId = p.channel?.id ?? ''
    const messageTs = p.message?.ts ?? ''
    const meta = JSON.stringify({ approvalId, stepId, channelId, messageTs, orgId: lookup.orgId })

    // Post views.open synchronously — Slack expects the trigger_id to be used
    // within ~3s, so we await this.
    const supabase = createAdminClient()
    const { data: org } = await supabase
      .from('org_settings')
      .select('slack_bot_token')
      .eq('org_id', lookup.orgId)
      .maybeSingle()
    const token = decryptSafe((org as { slack_bot_token: string | null } | null)?.slack_bot_token ?? null)
    if (!token) return NextResponse.json({})

    try {
      await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: {
            type: 'modal',
            callback_id: 'approval_reject_modal',
            private_metadata: meta,
            title: { type: 'plain_text', text: 'Reject approval' },
            submit: { type: 'plain_text', text: 'Reject' },
            close:  { type: 'plain_text', text: 'Cancel' },
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
          },
        }),
      })
    } catch (err) {
      logger.error('[slack-interactions] views.open failed', err)
    }
    return NextResponse.json({})
  }

  // Approve flow.
  try {
    await decideOnStep({
      approvalId, stepId, userId, decision: 'approved', comment: null,
    })
  } catch (err) {
    if (err instanceof ApprovalError) {
      logger.warn('[slack-interactions] approve rejected', { error: err.message, approvalId })
    } else {
      logger.error('[slack-interactions] approve threw', err)
    }
  }

  if (p.channel?.id && p.message?.ts) {
    await postUpdateAck(lookup.orgId, p.channel.id, p.message.ts, `✅ Approved by <@${p.user.id}>`)
  }
  return NextResponse.json({})
}

// ── view_submission: reject comment modal submit ──────────────────

async function handleViewSubmission(p: ViewSubmissionPayload): Promise<NextResponse> {
  if ('callback_id' in p.view && (p.view as { callback_id?: string }).callback_id !== 'approval_reject_modal') {
    return NextResponse.json({})
  }
  let meta: { approvalId: string; stepId: string; channelId?: string; messageTs?: string; orgId: string }
  try {
    meta = JSON.parse(p.view.private_metadata)
  } catch {
    return NextResponse.json({ response_action: 'errors' })
  }

  const comment = p.view.state.values?.comment_block?.comment_input?.value ?? ''
  if (!comment || comment.trim().length < 20) {
    return NextResponse.json({
      response_action: 'errors',
      errors: { comment_block: 'Reason must be at least 20 characters.' },
    })
  }

  const lookup = await lookupSlackEmail(p.team.id, p.user.id)
  if (!lookup) return NextResponse.json({ response_action: 'clear' })
  const userId = await ourUserIdByEmail(lookup.email)
  if (!userId) return NextResponse.json({ response_action: 'clear' })

  try {
    await decideOnStep({
      approvalId: meta.approvalId, stepId: meta.stepId, userId,
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
    await postUpdateAck(meta.orgId, meta.channelId, meta.messageTs, `❌ Rejected by <@${p.user.id}>`)
  }
  return NextResponse.json({ response_action: 'clear' })
}
