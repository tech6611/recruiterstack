-- ============================================================
-- 094: API keys for external programmatic access (LinkedIn extension).
--
-- All existing candidate/sequence routes authenticate via a Clerk browser
-- session (withCapability). A browser extension can't carry that session, so
-- it needs a per-org bearer token instead. This table stores those keys.
--
-- Security: we NEVER store the raw key. `key_hash` holds a SHA-256 hex digest
-- of the token; the raw value is shown to the user exactly once at creation.
-- `key_prefix` is a short, non-secret slice (e.g. "rs_live_a1b2c3") kept only
-- so the UI can help a user tell their keys apart and identify one to revoke.
--
-- A key is valid iff a row matches the incoming hash AND revoked_at IS NULL.
-- Scope: each key is bound to exactly one org_id; requests it authenticates
-- are scoped to that org, preserving existing multi-tenant isolation.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  name        text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  key_prefix  text NOT NULL,
  created_by  text,
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Lookups happen by hash on every extension request → must be indexed.
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);

-- The settings page lists a single org's keys.
CREATE INDEX IF NOT EXISTS api_keys_org_id_idx ON api_keys(org_id);
