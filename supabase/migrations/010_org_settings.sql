-- Per-org settings (Slack webhook, future config)
CREATE TABLE IF NOT EXISTS org_settings (
  org_id            TEXT PRIMARY KEY,
  slack_webhook_url TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
