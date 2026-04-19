import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
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

// PATCH /api/org-settings — partial update of any org-wide setting.
// Any admin-only field (company_name, company_size, industry, website,
// enabled_agents) requires the current user to be an admin.
export async function PATCH(request: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(request, orgSettingsUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()

  const adminFieldPresent =
    parsed.company_name !== undefined ||
    parsed.company_size !== undefined ||
    parsed.industry     !== undefined ||
    parsed.website      !== undefined ||
    parsed.enabled_agents !== undefined

  if (adminFieldPresent) {
    const { data: me } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()
    if ((me as { role: string } | null)?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can change company info or enabled agents.' },
        { status: 403 },
      )
    }
  }

  const patch: Record<string, unknown> = {
    org_id:     orgId,
    updated_at: new Date().toISOString(),
  }
  if (parsed.slack_webhook_url !== undefined) patch.slack_webhook_url = parsed.slack_webhook_url ?? null
  if (parsed.company_name      !== undefined) patch.company_name      = parsed.company_name
  if (parsed.company_size      !== undefined) patch.company_size      = parsed.company_size
  if (parsed.industry          !== undefined) patch.industry          = parsed.industry ?? null
  if (parsed.website           !== undefined) patch.website           = parsed.website ?? null
  if (parsed.enabled_agents    !== undefined) patch.enabled_agents    = parsed.enabled_agents

  const { data, error } = await supabase
    .from('org_settings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(patch as any, { onConflict: 'org_id' })
    .select()
    .single()

  if (error) return handleSupabaseError(error)

  await invalidate(cacheKey(orgId, `org-settings:${userId}`))

  return NextResponse.json({ data })
}
