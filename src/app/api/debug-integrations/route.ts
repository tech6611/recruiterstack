import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

/**
 * GET /api/debug-integrations
 *
 * Temporary debug endpoint — shows:
 *  - Which env vars are set (not their values)
 *  - Which DB columns exist and have data
 *  - Current connection status per provider
 *
 * DELETE THIS ROUTE before going to production.
 */
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Try to read all integration columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('org_settings')
    .select(
      'google_oauth_access_token, google_connected_email, ' +
      'zoom_access_token, zoom_connected_email, ' +
      'ms_access_token, ms_connected_email'
    )
    .eq('org_id', orgId)
    .single() as { data: any; error: any }

  return NextResponse.json({
    env: {
      GOOGLE_CLIENT_ID:     !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      ZOOM_CLIENT_ID:       !!process.env.ZOOM_CLIENT_ID,
      ZOOM_CLIENT_SECRET:   !!process.env.ZOOM_CLIENT_SECRET,
      MS_CLIENT_ID:         !!process.env.MS_CLIENT_ID,
      MS_CLIENT_SECRET:     !!process.env.MS_CLIENT_SECRET,
    },
    db: {
      error: error?.message ?? null,
      error_code: error?.code ?? null,
      columns_exist: !error,
      google_connected:     !!data?.google_oauth_access_token,
      google_email:         data?.google_connected_email ?? null,
      zoom_column_exists:   'zoom_access_token' in (data ?? {}),
      zoom_connected:       !!data?.zoom_access_token,
      zoom_email:           data?.zoom_connected_email ?? null,
      ms_column_exists:     'ms_access_token' in (data ?? {}),
      ms_connected:         !!data?.ms_access_token,
      ms_email:             data?.ms_connected_email ?? null,
    },
    org_id: orgId,
  })
}
