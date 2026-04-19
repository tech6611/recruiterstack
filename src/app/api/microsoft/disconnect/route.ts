import { NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { clearTokens } from '@/lib/integrations/store'

// POST /api/microsoft/disconnect — clears this user's Microsoft tokens.
// Microsoft v2.0 doesn't expose a simple revoke endpoint; deleting the row is sufficient.
export async function POST() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { userId } = authResult

  try {
    await clearTokens(userId, 'microsoft')
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to disconnect' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
