import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { cached, cacheKey, invalidate } from '@/lib/api/cache'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { orgSettingsUpdateSchema } from '@/lib/validations/org-settings'
import { getViewerScope, assertCapability } from '@/lib/rbac'

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
      .select('slack_webhook_url, slack_bot_token, slack_team_name, slack_routing')
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
      slack_routing:          orgRow?.slack_routing     ?? null,
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

  const brandingFields = [
    'careers_slug', 'careers_public', 'logo_url', 'hero_image_url',
    'brand_color', 'accent_color', 'brand_font', 'tagline', 'about',
    'hero_headline', 'hero_subheadline', 'nav_links', 'nav_cta_label',
    'nav_cta_url', 'show_powered_by', 'content_sections',
  ] as const

  const adminFieldPresent =
    parsed.company_name !== undefined ||
    parsed.company_size !== undefined ||
    parsed.industry     !== undefined ||
    parsed.website      !== undefined ||
    parsed.enabled_agents !== undefined ||
    parsed.slack_routing  !== undefined ||
    brandingFields.some((f) => parsed[f] !== undefined)

  if (adminFieldPresent) {
    const scope = await getViewerScope(supabase, orgId, userId)
    const denied = assertCapability(scope, 'settings:edit')
    if (denied) return denied
  }

  // Slug must be unique across all orgs (case-insensitive). Check before upsert
  // so we can return a friendly message instead of a raw DB constraint error.
  if (parsed.careers_slug) {
    const { data: clash } = await supabase
      .from('org_settings')
      .select('org_id')
      .ilike('careers_slug', parsed.careers_slug)
      .neq('org_id', orgId)
      .maybeSingle()
    if (clash) {
      return NextResponse.json(
        { error: 'That careers page address is already taken — pick another.' },
        { status: 409 }
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
  if (parsed.careers_slug      !== undefined) patch.careers_slug      = parsed.careers_slug ?? null
  if (parsed.careers_public    !== undefined) patch.careers_public    = parsed.careers_public
  if (parsed.logo_url          !== undefined) patch.logo_url          = parsed.logo_url ?? null
  if (parsed.hero_image_url    !== undefined) patch.hero_image_url    = parsed.hero_image_url ?? null
  if (parsed.brand_color       !== undefined) patch.brand_color       = parsed.brand_color ?? null
  if (parsed.accent_color      !== undefined) patch.accent_color      = parsed.accent_color ?? null
  if (parsed.brand_font        !== undefined) patch.brand_font        = parsed.brand_font ?? null
  if (parsed.tagline           !== undefined) patch.tagline           = parsed.tagline ?? null
  if (parsed.about             !== undefined) patch.about             = parsed.about ?? null
  if (parsed.hero_headline     !== undefined) patch.hero_headline     = parsed.hero_headline ?? null
  if (parsed.hero_subheadline  !== undefined) patch.hero_subheadline  = parsed.hero_subheadline ?? null
  if (parsed.nav_links         !== undefined) patch.nav_links         = parsed.nav_links
  if (parsed.nav_cta_label     !== undefined) patch.nav_cta_label     = parsed.nav_cta_label ?? null
  if (parsed.nav_cta_url       !== undefined) patch.nav_cta_url       = parsed.nav_cta_url ?? null
  if (parsed.show_powered_by   !== undefined) patch.show_powered_by   = parsed.show_powered_by
  if (parsed.content_sections  !== undefined) patch.content_sections  = parsed.content_sections
  if (parsed.slack_routing     !== undefined) patch.slack_routing      = parsed.slack_routing

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
