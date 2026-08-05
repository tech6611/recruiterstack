-- ============================================================
-- 098: Native Slack channel posting.
--
-- Slices 1-2 made DMs native (rich, interactive) but channel posts still
-- went through a hand-pasted incoming webhook as plain text. This migration
-- backs the switch to bot-token chat.postMessage:
--
--   org_settings.slack_channel_id / slack_channel_name
--     — the channel an admin picks (in Settings) for lifecycle alerts.
--       When unset, dispatch falls back to the legacy webhook.
--
--   slack_channel_messages
--     — one row per (org, application): the Slack message ts of the FIRST
--       channel post for that candidate (candidate_applied). Later events
--       (stage_moved / candidate_hired) look this up and reply in-thread,
--       so a candidate's updates stay together instead of scattering.
--
-- org_id is TEXT (a Clerk org id), matching the other tables.
-- ============================================================

-- ── org_settings: chosen channel ─────────────────────────────
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS slack_channel_id   TEXT,
  ADD COLUMN IF NOT EXISTS slack_channel_name TEXT;

-- ── slack_channel_messages: per-application thread anchor ─────
CREATE TABLE IF NOT EXISTS slack_channel_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT NOT NULL,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  channel_id     TEXT NOT NULL,      -- the Slack channel the message lives in
  ts             TEXT NOT NULL,      -- Slack message timestamp (its thread anchor)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, application_id)    -- one thread anchor per candidate, per org
);

CREATE INDEX IF NOT EXISTS idx_slack_channel_messages_org
  ON slack_channel_messages(org_id);

CREATE TRIGGER set_slack_channel_messages_updated_at
  BEFORE UPDATE ON slack_channel_messages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE slack_channel_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_slack_channel_messages" ON slack_channel_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Tell PostgREST to pick up the new column + table.
NOTIFY pgrst, 'reload schema';
