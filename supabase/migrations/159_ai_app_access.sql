-- 159_ai_app_access.sql
-- AI app (MCP) access: lets ChatGPT / Claude / other MCP clients use RecruiterStack
-- on a recruiter's behalf. Three tables:
--   ai_app_settings    — per-workspace switch (AI access on by default) + limits
--   ai_app_connections — one row per (workspace, user, AI app); revoked_at = disconnected
--   ai_app_audit       — one row per MCP tool call: who, which app, which tool, outcome.
--                        Stores record IDs only — never candidate details or chat text.
-- Additive only — no existing table is touched.

CREATE TABLE IF NOT EXISTS ai_app_settings (
  org_id               text PRIMARY KEY,
  enabled              boolean NOT NULL DEFAULT true,   -- no row = enabled (decision 6: on by default)
  sourcing_daily_runs  int     NOT NULL DEFAULT 10,     -- per user per day, for find_new_candidates_for_job
  updated_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_app_connections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         text NOT NULL,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id      text NOT NULL,                         -- OAuth client (ChatGPT, Claude, ...)
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,                           -- set = disconnected; every call is refused
  revoked_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (org_id, user_id, client_id)
);

CREATE TABLE IF NOT EXISTS ai_app_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  org_id         text,                                  -- null only if the call was refused before the workspace was known
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  clerk_user_id  text,
  client_id      text,
  tool           text NOT NULL,
  outcome        text NOT NULL CHECK (outcome IN ('ok', 'denied', 'error')),
  reason         text,                                  -- denial code or error class; never candidate data
  input_ids      jsonb NOT NULL DEFAULT '{}'::jsonb,    -- only *_id / *_ids arguments
  result_count   int,
  latency_ms     int
);

CREATE INDEX IF NOT EXISTS idx_ai_app_audit_org_time ON ai_app_audit (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_app_connections_user ON ai_app_connections (org_id, user_id);

-- Server-only tables: RLS on with NO policy, so only the service role (server code)
-- can read or write them — never the browser's public key.
ALTER TABLE ai_app_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_app_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_app_audit       ENABLE ROW LEVEL SECURITY;
