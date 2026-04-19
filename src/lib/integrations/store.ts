/**
 * Per-user OAuth integration storage.
 *
 * Pure CRUD — no provider-specific logic (refresh, API calls).
 * Consumers (src/lib/google/calendar.ts, etc.) call these helpers
 * to read/write tokens, then handle refresh on their own.
 *
 * Tokens are AES-256-GCM encrypted on write via src/lib/crypto.ts.
 * Reads use decryptSafe() which tolerates legacy plaintext rows.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { encrypt, decryptSafe } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import type {
  IntegrationProvider,
  UserIntegration,
  DecryptedTokens,
} from '@/lib/types/integrations'

// encrypt() throws if TOKEN_ENCRYPTION_KEY is unset. Keep storage working
// in that mode by falling back to plaintext — matches legacy org_settings behavior.
function encryptSafe(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null
  try {
    return encrypt(plaintext)
  } catch {
    return plaintext
  }
}

// ── Payload types ────────────────────────────────────────────

/** What a callback passes into saveTokens after exchanging the auth code. */
export interface SaveTokensInput {
  user_id: string
  org_id: string
  provider: IntegrationProvider
  access_token: string
  refresh_token: string | null
  token_expiry: string | null
  connected_email: string | null
  scopes?: string[]
  tenant_id?: string | null                // Microsoft
  account_id?: string | null               // Zoom
}

/** What refresh helpers pass in after obtaining new tokens. */
export interface RefreshTokensInput {
  access_token: string
  refresh_token?: string | null           // some providers rotate refresh tokens
  token_expiry: string | null
}

// ── Reads ────────────────────────────────────────────────────

/**
 * Returns decrypted tokens for the given user+provider, or null if none stored.
 * Does NOT perform refresh — callers are responsible for that.
 */
export async function getTokens(
  userId: string,
  provider: IntegrationProvider,
): Promise<DecryptedTokens | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) {
    logger.error('Failed to read user_integrations', error, { userId, provider })
    return null
  }
  if (!data) return null

  const row = data as UserIntegration
  const access = decryptSafe(row.access_token_encrypted)
  if (!access) return null                 // no usable token

  return {
    access_token: access,
    refresh_token: decryptSafe(row.refresh_token_encrypted),
    token_expiry: row.token_expiry,
    scopes: row.scopes,
    connected_email: row.connected_email,
    tenant_id: row.tenant_id,
    account_id: row.account_id,
  }
}

/**
 * Returns all integrations for a user (connection state badges, Settings UI).
 * Does NOT decrypt — this is for presence/metadata display only.
 */
export async function listUserIntegrations(userId: string): Promise<UserIntegration[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)

  if (error || !data) return []
  return data as UserIntegration[]
}

// ── Writes ───────────────────────────────────────────────────

/**
 * Upsert tokens for a user+provider. Called by the OAuth callback after
 * exchanging the auth code.
 */
export async function saveTokens(input: SaveTokensInput): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id: input.user_id,
        org_id: input.org_id,
        provider: input.provider,
        access_token_encrypted: encryptSafe(input.access_token),
        refresh_token_encrypted: encryptSafe(input.refresh_token),
        token_expiry: input.token_expiry,
        connected_email: input.connected_email,
        scopes: input.scopes ?? [],
        tenant_id: input.tenant_id ?? null,
        account_id: input.account_id ?? null,
        connected_at: new Date().toISOString(),
        // Clear any stale refresh-failure markers on a fresh connect.
        refresh_failed_at: null,
        refresh_failure_reason: null,
      },
      { onConflict: 'user_id,provider' },
    )

  if (error) {
    logger.error('Failed to save user_integration tokens', error, {
      userId: input.user_id, provider: input.provider,
    })
    throw error
  }
}

/**
 * Called by provider refresh helpers after a successful refresh call.
 */
export async function updateAfterRefresh(
  userId: string,
  provider: IntegrationProvider,
  tokens: RefreshTokensInput,
): Promise<void> {
  const supabase = createAdminClient()
  const patch: Record<string, unknown> = {
    access_token_encrypted: encryptSafe(tokens.access_token),
    token_expiry: tokens.token_expiry,
    last_refresh_at: new Date().toISOString(),
    refresh_failed_at: null,
    refresh_failure_reason: null,
  }
  if (tokens.refresh_token !== undefined) {
    patch.refresh_token_encrypted = encryptSafe(tokens.refresh_token)
  }

  const { error } = await supabase
    .from('user_integrations')
    .update(patch)
    .eq('user_id', userId)
    .eq('provider', provider)

  if (error) {
    logger.error('Failed to update tokens after refresh', error, { userId, provider })
    throw error
  }
}

/**
 * Mark a refresh attempt as failed (for diagnostics; the token row stays so
 * retry is possible). Clears on next successful refresh or reconnect.
 */
export async function markRefreshFailure(
  userId: string,
  provider: IntegrationProvider,
  reason: string,
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('user_integrations')
    .update({
      refresh_failed_at: new Date().toISOString(),
      refresh_failure_reason: reason.slice(0, 500),
    })
    .eq('user_id', userId)
    .eq('provider', provider)
}

/**
 * Delete the integration row. Called by /api/{provider}/disconnect.
 */
export async function clearTokens(userId: string, provider: IntegrationProvider): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)

  if (error) {
    logger.error('Failed to clear user_integration', error, { userId, provider })
    throw error
  }
}
