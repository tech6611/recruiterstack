import { NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getTokens, clearTokens } from '@/lib/integrations/store'

// POST /api/google/disconnect — best-effort revokes then clears this user's Google tokens.
export async function POST() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { userId } = authResult

  // Best-effort revoke (Google accepts either access or refresh token).
  const stored = await getTokens(userId, 'google')
  const tokenToRevoke = stored?.refresh_token ?? stored?.access_token
  if (tokenToRevoke) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
      method: 'POST',
    }).catch(() => {})
  }

  try {
    await clearTokens(userId, 'google')
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to disconnect' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
