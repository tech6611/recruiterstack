-- ============================================================
-- 040: Per-user OAuth integrations (Google, Microsoft, Zoom)
-- Replaces the org-level columns in org_settings for these three providers.
-- Slack stays in org_settings (bot token is intentionally org-shared).
--
-- Tokens are AES-256-GCM encrypted via src/lib/crypto.ts before being
-- stored here; decrypted on read via decryptSafe() which tolerates
-- legacy plaintext values during the migration window.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_integrations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id                   TEXT NOT NULL,             -- denormalized for fast "which users in this org have connected Google?"
  provider                 TEXT NOT NULL
                           CHECK (provider IN ('google', 'microsoft', 'zoom')),
  access_token_encrypted   TEXT,
  refresh_token_encrypted  TEXT,
  token_expiry             TIMESTAMPTZ,
  connected_email          TEXT,
  scopes                   TEXT[] NOT NULL DEFAULT '{}',
  tenant_id                TEXT,                      -- Microsoft-specific (Azure AD tenant)
  account_id               TEXT,                      -- Zoom-specific
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refresh_at          TIMESTAMPTZ,
  refresh_failed_at        TIMESTAMPTZ,               -- set when a refresh attempt fails; cleared on success
  refresh_failure_reason   TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user       ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_org        ON user_integrations(org_id, provider);
-- Hot query: "is this user connected to this provider?"
CREATE INDEX IF NOT EXISTS idx_user_integrations_lookup     ON user_integrations(user_id, provider);

CREATE TRIGGER set_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_user_integrations"
  ON user_integrations FOR ALL USING (true) WITH CHECK (true);
