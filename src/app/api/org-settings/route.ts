import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg, requireOrgAndUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { cached, cacheKey, invalidate } from '@/lib/api/cache'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { orgSettingsUpdateSchema } from '@/lib/validations/org-settings'

// GET /api/org-settings — returns connection status for the current user.
// Google / Microsoft / Zoom are per-user (user_integrations).
// Slack stays org-level (shared bot install).
//
// Cache is keyed by (orgId, userId) because Google/MS/Zoom state differs per user.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const settingsData = await cached(cacheKey(orgId, `org-settings:${userId}`), 300, async () => {
    const supabase = createAdminClient()

    // Org-level: Slack
    const { data: orgRow, error: orgErr } = await supabase
      .from('org_settings')
      .select('slack_webhook_url, slack_bot_token, slack_team_name')
      .eq('org_id', orgId)
      .maybeSingle()

    if (orgErr && orgErr.code !== 'PGRST116') {
      logger.error('[org-settings] org_settings query failed', orgErr)
    }

    // Per-user: Google / Microsoft / Zoom
    const { data: integrations, error: intErr } = await supabase
      .from('user_integrations')
      .select('provider, connected_email')
      .eq('user_id', userId)

    if (intErr) {
      logger.error('[org-settings] user_integrations query failed', intErr)
    }

    const byProvider = new Map<string, { connected_email: string | null }>()
    for (const row of (integrations ?? []) as Array<{ provider: string; connected_email: string | null }>) {
      byProvider.set(row.provider, { connected_email: row.connected_email })
    }

    return {
      slack_webhook_url:      orgRow?.slack_webhook_url ?? null,
      slack_connected:        !!orgRow?.slack_bot_token,
      slack_team_name:        orgRow?.slack_team_name   ?? null,
      google_connected:       byProvider.has('google'),
      google_connected_email: byProvider.get('google')?.connected_email ?? null,
      zoom_connected:         byProvider.has('zoom'),
      zoom_connected_email:   byProvider.get('zoom')?.connected_email ?? null,
      ms_connected:           byProvider.has('microsoft'),
      ms_connected_email:     byProvider.get('microsoft')?.connected_email ?? null,
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

  // Slack changes are org-wide — the cache key embeds userId, so we'd have to
  // scan N keys. Keep this simple: only invalidate the current user's entry;
  // other users' cached copies expire naturally at 5 min.
  const authForInvalidate = await requireOrgAndUser()
  if (!(authForInvalidate instanceof NextResponse)) {
    await invalidate(cacheKey(orgId, `org-settings:${authForInvalidate.userId}`))
  }

  return NextResponse.json({ data })
}
