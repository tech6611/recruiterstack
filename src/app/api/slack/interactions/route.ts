/**
 * Slack interactivity endpoint.
 *
 * Slack POSTs here when a user clicks a button (payload type "block_actions")
 * or submits a modal (payload type "view_submission"). Every request is
 * signature-verified; Slack requires a 200 within 3s.
 *
 * This route is a thin dispatcher: it verifies the signature, parses the
 * payload, resolves the acting user ONCE via the cached identity resolver, then
 * hands off to the handler registered for that `action_id` / `callback_id` in
 * lib/slack/actions.ts. Unknown ids are ignored (e.g. the "Open in app" link
 * button). Feature logic lives in lib/slack/handlers/*, not here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack/verify'
import { resolveSlackUser } from '@/lib/slack/identity'
import { getBlockActionHandler, getViewSubmissionHandler } from '@/lib/slack/actions'

interface SlackUser { id: string }
interface ButtonAction { action_id: string; value?: string }
interface BlockActionsPayload {
  type: 'block_actions'
  user: SlackUser
  trigger_id: string
  actions: ButtonAction[]
  message: { ts: string; channel?: string }
  channel: { id: string }
  team: { id: string }
  response_url?: string
}
interface ViewSubmissionPayload {
  type: 'view_submission'
  user: SlackUser
  view: {
    callback_id?: string
    private_metadata: string
    state: { values: Record<string, Record<string, { value?: string }>> }
  }
  team: { id: string }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
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

  if (payload.type === 'block_actions') return handleBlockActions(payload)
  if (payload.type === 'view_submission') return handleViewSubmission(payload)
  return NextResponse.json({})
}

async function handleBlockActions(p: BlockActionsPayload): Promise<NextResponse> {
  const action = p.actions?.[0]
  if (!action) return NextResponse.json({})

  const handler = getBlockActionHandler(action.action_id)
  if (!handler) return NextResponse.json({}) // unknown action → ignore

  const user = await resolveSlackUser(p.team.id, p.user.id)
  if (!user) return NextResponse.json({}) // can't match Slack user → no-op

  return handler({
    orgId: user.orgId,
    userId: user.userId,
    email: user.email,
    slackUserId: p.user.id,
    action: { action_id: action.action_id, value: action.value ?? '' },
    triggerId: p.trigger_id,
    channelId: p.channel?.id ?? '',
    messageTs: p.message?.ts ?? '',
    responseUrl: p.response_url ?? '',
  })
}

async function handleViewSubmission(p: ViewSubmissionPayload): Promise<NextResponse> {
  const callbackId = p.view?.callback_id ?? ''
  const handler = getViewSubmissionHandler(callbackId)
  if (!handler) return NextResponse.json({}) // unknown modal → ignore

  const user = await resolveSlackUser(p.team.id, p.user.id)
  if (!user) return NextResponse.json({ response_action: 'clear' })

  return handler({
    orgId: user.orgId,
    userId: user.userId,
    email: user.email,
    slackUserId: p.user.id,
    callbackId,
    privateMetadata: p.view.private_metadata,
    values: p.view.state?.values ?? {},
  })
}
