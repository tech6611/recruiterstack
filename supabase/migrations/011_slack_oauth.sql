-- Slack OAuth bot token per org (for DMs to hiring managers)
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS slack_bot_token  TEXT,
  ADD COLUMN IF NOT EXISTS slack_team_id    TEXT,
  ADD COLUMN IF NOT EXISTS slack_team_name  TEXT;
