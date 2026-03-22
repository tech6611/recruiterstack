import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/auth'
import { generateOAuthState } from '@/lib/api/oauth-state'

// GET /api/google/connect — redirects to Google OAuth authorization page
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google integration not configured' }, { status: 500 })
  }

  const redirectUri = encodeURIComponent(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
  )

  // Scopes:
  //   calendar.events — create/read/update events
  //   calendar.readonly — read-only free/busy (for availability checks)
  //   userinfo.email — identify the connected account
  //   drive.readonly — read files from Google Drive (CV import)
  const scopes = encodeURIComponent(
    [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/drive.readonly',
    ].join(' ')
  )

  const state = encodeURIComponent(generateOAuthState(orgId))

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=${scopes}` +
    `&access_type=offline` +   // request a refresh token
    `&prompt=consent` +        // always show consent screen to ensure refresh token
    `&include_granted_scopes=true` +
    `&state=${state}`

  return NextResponse.redirect(url)
}
