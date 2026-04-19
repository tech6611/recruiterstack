import { NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getTokens, clearTokens } from '@/lib/integrations/store'

// POST /api/zoom/disconnect — best-effort revoke then clear this user's Zoom tokens.
export async function POST() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { userId } = authResult

  // Best-effort revoke — Zoom uses Basic auth for revoke endpoint.
  const stored = await getTokens(userId, 'zoom')
  const tokenToRevoke = stored?.access_token
  if (tokenToRevoke) {
    const clientId     = process.env.ZOOM_CLIENT_ID!
    const clientSecret = process.env.ZOOM_CLIENT_SECRET!
    fetch('https://zoom.us/oauth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ token: tokenToRevoke }),
    }).catch(() => {})
  }

  try {
    await clearTokens(userId, 'zoom')
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to disconnect' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
