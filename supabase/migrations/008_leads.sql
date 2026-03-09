-- Marketing homepage lead capture
CREATE TABLE IF NOT EXISTS leads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  source     TEXT        NOT NULL DEFAULT 'homepage',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leads_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
