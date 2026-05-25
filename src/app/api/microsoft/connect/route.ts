import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { generateOAuthState } from '@/lib/api/oauth-state'
import { readOAuthOrigin } from '@/lib/api/oauth-origin'

// GET /api/microsoft/connect — redirects to Microsoft OAuth authorization page.
// State embeds orgId + current user's internal id for per-user token storage.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult
  const origin = readOAuthOrigin(req)

  const clientId = process.env.MS_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Microsoft integration not configured' }, { status: 500 })
  }

  const redirectUri = encodeURIComponent(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/microsoft/callback`
  )

  const scopes = encodeURIComponent(
    'Calendars.ReadWrite User.Read offline_access'
  )

  const state = encodeURIComponent(generateOAuthState({ orgId, userId, origin }))

  const url =
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=${scopes}` +
    `&state=${state}` +
    `&prompt=consent`

  return NextResponse.redirect(url)
}
