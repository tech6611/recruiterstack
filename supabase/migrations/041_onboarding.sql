-- ============================================================
-- 041: Onboarding support
--   - org_members.onboarded_at: null = show onboarding flow
--   - org_settings.company_name / size / industry / website:
--     captured in the admin-only Org Info step
--   - org_settings.enabled_agents: feature flags for the 5 AI
--     agents (Drafter, Scout, Sifter, Scheduler, Closer). Stored
--     here so we can read them once per request.
-- ============================================================

ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_members_unonboarded
  ON org_members(org_id, user_id)
  WHERE onboarded_at IS NULL;

-- Org-wide attributes captured by the first admin during onboarding
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS company_name   TEXT,
  ADD COLUMN IF NOT EXISTS company_size   TEXT,
  ADD COLUMN IF NOT EXISTS industry       TEXT,
  ADD COLUMN IF NOT EXISTS website        TEXT,
  ADD COLUMN IF NOT EXISTS enabled_agents TEXT[] NOT NULL
    DEFAULT ARRAY['drafter', 'scout', 'sifter', 'scheduler', 'closer']::TEXT[];

-- Company-size enum as a CHECK (TEXT+CHECK pattern — our chosen style)
ALTER TABLE org_settings
  DROP CONSTRAINT IF EXISTS org_settings_company_size_valid;
ALTER TABLE org_settings
  ADD CONSTRAINT org_settings_company_size_valid
  CHECK (company_size IS NULL OR company_size IN ('1-10','11-50','51-200','201-1000','1000+'));

-- enabled_agents values must be drawn from our fixed set
ALTER TABLE org_settings
  DROP CONSTRAINT IF EXISTS org_settings_enabled_agents_valid;
ALTER TABLE org_settings
  ADD CONSTRAINT org_settings_enabled_agents_valid
  CHECK (
    enabled_agents <@ ARRAY['drafter','scout','sifter','scheduler','closer']::TEXT[]
  );
