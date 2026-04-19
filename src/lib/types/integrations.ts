// user_integrations table — per-user OAuth tokens. Matches migration 040.
// Slack is intentionally NOT represented here (stays org-level in org_settings).

export type IntegrationProvider = 'google' | 'microsoft' | 'zoom'

export interface UserIntegration {
  id: string
  user_id: string
  org_id: string
  provider: IntegrationProvider
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expiry: string | null
  connected_email: string | null
  scopes: string[]
  tenant_id: string | null
  account_id: string | null
  connected_at: string
  last_refresh_at: string | null
  refresh_failed_at: string | null
  refresh_failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface UserIntegrationInsert extends Omit<UserIntegration,
  'id' | 'created_at' | 'updated_at' | 'scopes' | 'connected_at' |
  'last_refresh_at' | 'refresh_failed_at' | 'refresh_failure_reason' |
  'access_token_encrypted' | 'refresh_token_encrypted' |
  'token_expiry' | 'connected_email' | 'tenant_id' | 'account_id'> {
  id?: string
  scopes?: string[]
  connected_at?: string
  last_refresh_at?: string | null
  refresh_failed_at?: string | null
  refresh_failure_reason?: string | null
  access_token_encrypted?: string | null
  refresh_token_encrypted?: string | null
  token_expiry?: string | null
  connected_email?: string | null
  tenant_id?: string | null
  account_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface UserIntegrationUpdate extends Partial<UserIntegrationInsert> {}

// ── Plaintext shape used at runtime (after decrypt) ──
// Nothing in this interface is encrypted — safe to pass around in memory,
// NEVER to log or serialize.
export interface DecryptedTokens {
  access_token: string
  refresh_token: string | null
  token_expiry: string | null          // ISO timestamp
  scopes: string[]
  connected_email: string | null
  tenant_id: string | null             // MS
  account_id: string | null            // Zoom
}
