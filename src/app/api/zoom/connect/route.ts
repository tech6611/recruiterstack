import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { generateOAuthState } from '@/lib/api/oauth-state'
import { readOAuthOrigin } from '@/lib/api/oauth-origin'

// GET /api/zoom/connect — redirects to Zoom OAuth authorization page.
// State embeds orgId + current user's internal id for per-user token storage.
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult
  const origin = readOAuthOrigin(req)

  const clientId = process.env.ZOOM_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Zoom integration not configured' }, { status: 500 })
  }

  const redirectUri = encodeURIComponent(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/zoom/callback`
  )

  const state = encodeURIComponent(generateOAuthState({ orgId, userId, origin }))

  const url =
    `https://zoom.us/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&state=${state}`

  return NextResponse.redirect(url)
}
