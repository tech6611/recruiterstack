import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// GET /api/slack/install — redirects to Slack OAuth authorization page
export async function GET() {
  const { userId } = auth()
  if (!userId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/sign-in`)
  }

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Slack integration not configured' }, { status: 500 })
  }

  const scopes = 'chat:write,users:read,users:read.email,im:write'
  const redirectUri = encodeURIComponent(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/slack/callback`
  )

  const url =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${redirectUri}`

  return NextResponse.redirect(url)
}
