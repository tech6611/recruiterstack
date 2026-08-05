-- ============================================================
-- 097: Slack ↔ RecruiterStack identity map.
--
-- Until now, matching a Slack user to a RecruiterStack user (and back)
-- was done with a LIVE Slack API call on every message — users.info for
-- inbound button clicks, users.lookupByEmail for outbound DMs. That is
-- slow and silently fails when the email doesn't match a workspace member
-- (the "why did no DM arrive?" gotcha).
--
-- slack_user_map is a persistent cache of that mapping: (org, user) ↔
-- slack_user_id. Resolvers (src/lib/slack/identity.ts) read this table
-- first and fall back to the live API only on a miss, caching the result.
-- This is also the foundation for reliable native DMs and, later, for
-- attributing in-Slack actions to the right RecruiterStack account.
--
-- org_id is TEXT (a Clerk org id), matching application_events /
-- email_conversations — NOT a UUID.
-- ============================================================

CREATE TABLE IF NOT EXISTS slack_user_map (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,          -- e.g. "U01ABC23DEF"
  slack_team_id TEXT,                   -- workspace the mapping was resolved in
  email         TEXT,                   -- email used to resolve, for diagnostics
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slack_user_id),       -- one RS user per Slack user, per org
  UNIQUE (org_id, user_id)              -- one Slack user per RS user, per org
);

CREATE INDEX IF NOT EXISTS idx_slack_user_map_org
  ON slack_user_map(org_id);

CREATE TRIGGER set_slack_user_map_updated_at
  BEFORE UPDATE ON slack_user_map
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE slack_user_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_slack_user_map" ON slack_user_map
  FOR ALL USING (true) WITH CHECK (true);

-- Tell PostgREST to pick up the new table.
NOTIFY pgrst, 'reload schema';
