import { NextRequest, NextResponse } from 'next/server'
import { requireOrg } from '@/lib/auth'
import { generateOAuthState } from '@/lib/api/oauth-state'
import { readOAuthOrigin } from '@/lib/api/oauth-origin'

// GET /api/slack/install — redirects to Slack OAuth authorization page
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult
  const origin = readOAuthOrigin(req)

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Slack integration not configured' }, { status: 500 })
  }

  const scopes = 'chat:write,users:read,users:read.email,im:write'
  const redirectUri = encodeURIComponent(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/slack/callback`
  )

  const state = encodeURIComponent(generateOAuthState({ orgId, origin }))

  const url =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${state}`

  return NextResponse.redirect(url)
}
