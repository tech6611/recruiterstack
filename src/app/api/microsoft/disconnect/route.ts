import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// POST /api/microsoft/disconnect — clears stored Microsoft OAuth tokens
// Note: Microsoft identity platform v2.0 does not offer a simple token revocation endpoint.
// Clearing the DB is sufficient — the refresh token becomes useless once removed.
export async function POST() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('org_settings')
    .update({
      ms_access_token:    null,
      ms_refresh_token:   null,
      ms_token_expiry:    null,
      ms_tenant_id:       null,
      ms_connected_email: null,
      updated_at:         new Date().toISOString(),
    })
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
