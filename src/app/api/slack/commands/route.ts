/**
 * Slack slash-command endpoint (/recruiterstack …).
 *
 * Slack POSTs an application/x-www-form-urlencoded body here. Like the
 * interactions route, we verify the signature against the RAW body first, then
 * parse and delegate to the command handler. Register the command in the Slack
 * app dashboard with Request URL {APP_URL}/api/slack/commands (the `commands`
 * scope was granted in the Slice 3 reconnect).
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack/verify'
import { handleSlashCommand } from '@/lib/slack/handlers/commands'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const tsHeader = req.headers.get('x-slack-request-timestamp')
  const sigHeader = req.headers.get('x-slack-signature')

  if (!verifySlackSignature({ rawBody, timestamp: tsHeader, signature: sigHeader })) {
    return new NextResponse('Bad signature', { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  return handleSlashCommand({
    teamId: params.get('team_id') ?? '',
    slackUserId: params.get('user_id') ?? '',
    text: params.get('text') ?? '',
  })
}
