import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { cached, cacheKey, invalidate } from '@/lib/api/cache'

// GET /api/org-settings — returns current settings for the org
export async function GET() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const settingsData = await cached(cacheKey(orgId, 'org-settings'), 300, async () => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('org_settings')
      .select('slack_webhook_url, slack_bot_token, slack_team_name, google_oauth_access_token, google_connected_email')
      .eq('org_id', orgId)
      .single()

    if (error && error.code !== 'PGRST116') {
      logger.error('[org-settings] GET query failed — missing DB column or schema mismatch', error)
    }

    return {
      slack_webhook_url:    data?.slack_webhook_url    ?? null,
      slack_connected:      !!data?.slack_bot_token,
      slack_team_name:      data?.slack_team_name      ?? null,
      google_connected:     !!data?.google_oauth_access_token,
      google_connected_email: data?.google_connected_email ?? null,
    }
  })

  return NextResponse.json({ data: settingsData })
}

// PATCH /api/org-settings — upsert { slack_webhook_url }
export async function PATCH(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('org_settings')
    .upsert(
      { org_id: orgId, slack_webhook_url: body.slack_webhook_url ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate cached settings so the next GET fetches fresh data
  await invalidate(cacheKey(orgId, 'org-settings'))

  return NextResponse.json({ data })
}
