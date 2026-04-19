/**
 * Host-calendar token resolver.
 *
 * Given an interview panel (list of emails) and a target provider, tries to
 * obtain a usable access token by walking the panel in order:
 *   1. For each panel email, find the matching RecruiterStack user.
 *   2. Try that user's per-user integration tokens (user_integrations).
 *   3. On auth/refresh failure, fall through to the next panelist.
 *   4. If no panel member has working per-user tokens, fall back to the
 *      legacy org-level tokens in org_settings. This fallback exists during
 *      the transition window and will be removed after the org-token
 *      migration (B10) has run and been verified.
 *
 * Throws HostTokenUnavailableError if no source produced a working token.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { decryptSafe, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import {
  ensureValidGoogleTokensForUser,
  getValidAccessToken as getGoogleToken,
  GoogleNotConnectedError,
} from '@/lib/google/calendar'
import {
  ensureValidMSTokensForUser,
  getValidAccessToken as getMSToken,
  MicrosoftNotConnectedError,
} from '@/lib/microsoft/calendar'
import {
  ensureValidZoomTokensForUser,
  getValidAccessToken as getZoomToken,
  ZoomNotConnectedError,
} from '@/lib/zoom/meetings'

export type ResolvableProvider = 'google' | 'microsoft' | 'zoom'

export interface ResolvedHost {
  access_token: string
  connected_email: string | null
  host_user_id: string | null           // null when we fell back to org-level
  via: 'user_integrations' | 'org_settings'
}

export class HostTokenUnavailableError extends Error {
  constructor(public provider: ResolvableProvider) {
    super(`No usable ${provider} credentials available for this interview`)
    this.name = 'HostTokenUnavailableError'
  }
}

// ── Per-user attempt ──────────────────────────────────────────

async function tryPerUser(
  provider: ResolvableProvider,
  userId: string,
): Promise<Omit<ResolvedHost, 'via'> | null> {
  try {
    if (provider === 'google') {
      const ctx = await ensureValidGoogleTokensForUser(userId)
      return { access_token: ctx.access_token, connected_email: ctx.connected_email, host_user_id: userId }
    }
    if (provider === 'microsoft') {
      const ctx = await ensureValidMSTokensForUser(userId)
      return { access_token: ctx.access_token, connected_email: ctx.connected_email, host_user_id: userId }
    }
    const ctx = await ensureValidZoomTokensForUser(userId)
    return { access_token: ctx.access_token, connected_email: ctx.connected_email, host_user_id: userId }
  } catch (err) {
    if (
      err instanceof GoogleNotConnectedError ||
      err instanceof MicrosoftNotConnectedError ||
      err instanceof ZoomNotConnectedError
    ) {
      // User just hasn't connected — move on to next panelist quietly.
      return null
    }
    // Refresh failure (revoked token, etc.) — log but continue the fallback chain.
    logger.warn('[host-resolver] per-user token unusable, trying next', {
      provider, userId, err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ── Legacy org-level fallback ────────────────────────────────

async function tryOrgLegacy(
  provider: ResolvableProvider,
  orgId: string,
): Promise<Omit<ResolvedHost, 'via'> | null> {
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('org_settings')
    .select(
      'google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email, ' +
      'zoom_access_token, zoom_refresh_token, zoom_token_expiry, zoom_connected_email, ' +
      'ms_access_token, ms_refresh_token, ms_token_expiry, ms_connected_email',
    )
    .eq('org_id', orgId)
    .maybeSingle()

  if (!row) return null

  const settings = row as unknown as Record<string, string | null>

  try {
    if (provider === 'google') {
      const access  = decryptSafe(settings.google_oauth_access_token)
      const refresh = decryptSafe(settings.google_oauth_refresh_token)
      if (!access || !refresh) return null
      const { access_token, tokens: fresh } = await getGoogleToken({
        access_token: access, refresh_token: refresh,
        token_expiry: settings.google_oauth_token_expiry,
      })
      if (fresh.access_token !== access) {
        await supabase.from('org_settings').update({
          google_oauth_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
          google_oauth_token_expiry: fresh.token_expiry,
        }).eq('org_id', orgId)
      }
      return { access_token, connected_email: settings.google_connected_email, host_user_id: null }
    }
    if (provider === 'microsoft') {
      const access  = decryptSafe(settings.ms_access_token)
      const refresh = decryptSafe(settings.ms_refresh_token)
      if (!access || !refresh) return null
      const { access_token, tokens: fresh } = await getMSToken({
        access_token: access, refresh_token: refresh,
        token_expiry: settings.ms_token_expiry,
      })
      if (fresh.access_token !== access) {
        await supabase.from('org_settings').update({
          ms_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
          ms_token_expiry: fresh.token_expiry,
        }).eq('org_id', orgId)
      }
      return { access_token, connected_email: settings.ms_connected_email, host_user_id: null }
    }
    // zoom
    const access  = decryptSafe(settings.zoom_access_token)
    const refresh = decryptSafe(settings.zoom_refresh_token)
    if (!access || !refresh) return null
    const { access_token, tokens: fresh } = await getZoomToken({
      access_token: access, refresh_token: refresh,
      token_expiry: settings.zoom_token_expiry,
    })
    if (fresh.access_token !== access) {
      await supabase.from('org_settings').update({
        zoom_access_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.access_token) : fresh.access_token,
        zoom_refresh_token: process.env.TOKEN_ENCRYPTION_KEY ? encrypt(fresh.refresh_token) : fresh.refresh_token,
        zoom_token_expiry: fresh.token_expiry,
      }).eq('org_id', orgId)
    }
    return { access_token, connected_email: settings.zoom_connected_email, host_user_id: null }
  } catch (err) {
    logger.warn('[host-resolver] org-level fallback failed', {
      provider, orgId, err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ── Public API ───────────────────────────────────────────────

export async function resolveHost(
  provider: ResolvableProvider,
  panelEmails: string[],
  orgId: string,
): Promise<ResolvedHost> {
  // 1) Map panel emails → user_ids in panel order (skipping externals).
  const emails = panelEmails.map(e => e.trim().toLowerCase()).filter(Boolean)
  let userIdsInOrder: string[] = []
  if (emails.length > 0) {
    const supabase = createAdminClient()
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .in('email', emails)

    if (users) {
      const emailToId = new Map<string, string>()
      for (const u of users as Array<{ id: string; email: string }>) {
        emailToId.set(u.email.toLowerCase(), u.id)
      }
      for (const e of emails) {
        const id = emailToId.get(e)
        if (id) userIdsInOrder.push(id)
      }
    }
  }

  // 2) Try per-user in panel order.
  for (const userId of userIdsInOrder) {
    const hit = await tryPerUser(provider, userId)
    if (hit) return { ...hit, via: 'user_integrations' }
  }

  // 3) Fall back to legacy org-level tokens.
  const legacy = await tryOrgLegacy(provider, orgId)
  if (legacy) return { ...legacy, via: 'org_settings' }

  throw new HostTokenUnavailableError(provider)
}
