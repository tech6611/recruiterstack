-- ============================================================
-- 086: ai_usage — per-call AI token/cost ledger.
--
-- One row per LLM (Gemini) API call, written best-effort from
-- `trackUsage()` (src/lib/ai/track-usage.ts). Lets us answer
-- "cost per employee" and "cost per client (org)" from real data
-- instead of scraping stdout logs.
--
--   org_id   — the client/workspace the call belongs to (Clerk org
--              id, TEXT). Nullable: a few system/public flows have no
--              resolved org.
--   user_id  — the person who triggered the call, as our internal
--              users.id UUID (NOT the raw Clerk id). Nullable: public
--              token flows (apply / parse-cv) and background jobs have
--              no signed-in user. ON DELETE SET NULL keeps historical
--              cost intact if a user is later removed.
--   module   — which feature made the call (e.g. 'copilot', 'job-scorer').
--   model    — the resolved provider model (e.g. 'gemini-2.5-pro').
--
-- Additive and reversible (drop the table → reverts to stdout-only
-- logging). Inserts run via the service-role admin client, so RLS is
-- enabled with a service-role-all policy to match the rest of the schema.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  module              TEXT NOT NULL,
  model               TEXT NOT NULL,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd  NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reporting access patterns: totals per client over time, and per person.
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_created  ON ai_usage(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage(user_id, created_at);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_ai_usage" ON ai_usage FOR ALL USING (true) WITH CHECK (true);

-- Let PostgREST pick up the new table immediately.
NOTIFY pgrst, 'reload schema';
