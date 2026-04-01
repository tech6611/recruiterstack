import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { cached, cacheKey, invalidate } from '@/lib/api/cache'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { orgSettingsUpdateSchema } from '@/lib/validations/org-settings'

// GET /api/org-settings — returns current settings for the org
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const settingsData = await cached(cacheKey(orgId, 'org-settings'), 300, async () => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('org_settings')
      .select('slack_webhook_url, slack_bot_token, slack_team_name, google_oauth_access_token, google_connected_email, zoom_access_token, zoom_connected_email, ms_access_token, ms_connected_email')
      .eq('org_id', orgId)
      .single()

    if (error && error.code !== 'PGRST116') {
      logger.error('[org-settings] GET query failed — missing DB column or schema mismatch', error)
    }

    return {
      slack_webhook_url:      data?.slack_webhook_url      ?? null,
      slack_connected:        !!data?.slack_bot_token,
      slack_team_name:        data?.slack_team_name        ?? null,
      google_connected:       !!data?.google_oauth_access_token,
      google_connected_email: data?.google_connected_email ?? null,
      zoom_connected:         !!data?.zoom_access_token,
      zoom_connected_email:   data?.zoom_connected_email   ?? null,
      ms_connected:           !!data?.ms_access_token,
      ms_connected_email:     data?.ms_connected_email     ?? null,
    }
  })

  return NextResponse.json({ data: settingsData })
}

// PATCH /api/org-settings — upsert { slack_webhook_url }
export async function PATCH(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const parsed = await parseBody(request, orgSettingsUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('org_settings')
    .upsert(
      { org_id: orgId, slack_webhook_url: parsed.slack_webhook_url ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' }
    )
    .select()
    .single()

  if (error) return handleSupabaseError(error)

  // Invalidate cached settings so the next GET fetches fresh data
  await invalidate(cacheKey(orgId, 'org-settings'))

  return NextResponse.json({ data })
}
