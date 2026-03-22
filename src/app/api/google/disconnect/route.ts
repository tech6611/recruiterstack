import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { decryptSafe } from '@/lib/crypto'

// POST /api/google/disconnect — revokes and clears the stored Google OAuth tokens
export async function POST() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Fetch the access token so we can revoke it with Google
  const { data: settings } = await supabase
    .from('org_settings')
    .select('google_oauth_access_token, google_oauth_refresh_token')
    .eq('org_id', orgId)
    .single()

  // Best-effort revoke with Google (ignore errors) — decrypt first
  const tokenToRevoke = decryptSafe(settings?.google_oauth_access_token) ?? decryptSafe(settings?.google_oauth_refresh_token)
  if (tokenToRevoke) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
      method: 'POST',
    }).catch(() => {})
  }

  // Clear columns in DB
  const { error } = await supabase
    .from('org_settings')
    .update({
      google_oauth_access_token:  null,
      google_oauth_refresh_token: null,
      google_oauth_token_expiry:  null,
      google_connected_email:     null,
      updated_at:                 new Date().toISOString(),
    })
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
