import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { decryptSafe } from '@/lib/crypto'

// POST /api/zoom/disconnect — revokes and clears the stored Zoom OAuth tokens
export async function POST() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Fetch token for revocation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await supabase
    .from('org_settings')
    .select('zoom_access_token')
    .eq('org_id', orgId)
    .single() as { data: any; error: any }

  // Best-effort revoke with Zoom
  const tokenToRevoke = decryptSafe(settings?.zoom_access_token)
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

  // Clear columns in DB
  const { error } = await supabase
    .from('org_settings')
    .update({
      zoom_access_token:    null,
      zoom_refresh_token:   null,
      zoom_token_expiry:    null,
      zoom_account_id:      null,
      zoom_connected_email: null,
      updated_at:           new Date().toISOString(),
    })
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
