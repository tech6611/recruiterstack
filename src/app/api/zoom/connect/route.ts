import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/auth'
import { generateOAuthState } from '@/lib/api/oauth-state'

// GET /api/zoom/connect — redirects to Zoom OAuth authorization page
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const clientId = process.env.ZOOM_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Zoom integration not configured' }, { status: 500 })
  }

  const redirectUri = encodeURIComponent(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/zoom/callback`
  )

  const state = encodeURIComponent(generateOAuthState(orgId))

  const url =
    `https://zoom.us/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&state=${state}`

  return NextResponse.redirect(url)
}
