-- ============================================================
-- 035: Requisitions — Opening, Job, Posting, Hiring Team.
-- The core three-object model of the module.
--
-- Opening = funded headcount seat (finance object)
-- Job     = pipeline container (recruiting object)
-- Posting = public ad (marketing object)
--
-- Opening ↔ Job is many-to-many via job_openings.
-- Job → Postings is one-to-many.
-- ============================================================

-- ── hiring_teams ─────────────────────────────────────────────
-- A named set of people for a job (or a reusable template).
-- job_id IS NULL → template that can be cloned onto new jobs.
CREATE TABLE IF NOT EXISTS hiring_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  job_id      UUID,                                  -- FK added after jobs table below
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_teams_org  ON hiring_teams(org_id);
CREATE INDEX IF NOT EXISTS idx_hiring_teams_job  ON hiring_teams(job_id);

CREATE TRIGGER set_hiring_teams_updated_at
  BEFORE UPDATE ON hiring_teams
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE hiring_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_hiring_teams" ON hiring_teams FOR ALL USING (true) WITH CHECK (true);

-- ── hiring_team_members ──────────────────────────────────────
-- A user's role within a specific hiring team.
-- This is where `hiring_team_member` approver types resolve:
-- given a team + role, find the user_id.
CREATE TABLE IF NOT EXISTS hiring_team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hiring_team_id  UUID NOT NULL REFERENCES hiring_teams(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL
                  CHECK (role IN ('hiring_manager', 'recruiter', 'recruiting_coordinator',
                                  'sourcer', 'interviewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hiring_team_id, user_id, role)             -- same user can hold multiple roles
);

CREATE INDEX IF NOT EXISTS idx_hiring_team_members_team       ON hiring_team_members(hiring_team_id);
CREATE INDEX IF NOT EXISTS idx_hiring_team_members_user       ON hiring_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_hiring_team_members_team_role  ON hiring_team_members(hiring_team_id, role);

ALTER TABLE hiring_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_hiring_team_members" ON hiring_team_members FOR ALL USING (true) WITH CHECK (true);

-- ── jobs ─────────────────────────────────────────────────────
-- The recruiting pipeline container.
-- Created with status='draft'. Cannot move to 'open' until
-- at least one linked Opening is 'approved' (enforced in service layer).
CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT NOT NULL,
  title               TEXT NOT NULL,
  department_id       UUID REFERENCES departments(id) ON DELETE SET NULL,
  description         TEXT,                               -- internal JD/context
  hiring_team_id      UUID REFERENCES hiring_teams(id) ON DELETE SET NULL,
  interview_plan_id   UUID,                               -- future module
  scorecard_id        UUID,                               -- existing scorecards table? future wire-up
  confidentiality     TEXT NOT NULL DEFAULT 'public'
                      CHECK (confidentiality IN ('public', 'confidential')),
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'pending_approval', 'approved',
                                        'open', 'closed', 'archived')),
  approval_id         UUID,                               -- FK added after approvals migration
  custom_fields       JSONB NOT NULL DEFAULT '{}',
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_org              ON jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_jobs_org_status       ON jobs(org_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_department       ON jobs(department_id);
CREATE INDEX IF NOT EXISTS idx_jobs_hiring_team      ON jobs(hiring_team_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by       ON jobs(created_by);

CREATE TRIGGER set_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_jobs" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- Add the deferred hiring_teams.job_id FK now that jobs exists
ALTER TABLE hiring_teams
  ADD CONSTRAINT hiring_teams_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

-- ── openings ─────────────────────────────────────────────────
-- One funded headcount seat. Approved separately from jobs.
-- A job "fills" 1..N openings via job_openings.
CREATE TABLE IF NOT EXISTS openings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT NOT NULL,
  external_id          TEXT,                              -- for future HRIS sync (Workday, etc.)
  title                TEXT NOT NULL,
  department_id        UUID REFERENCES departments(id) ON DELETE SET NULL,
  location_id          UUID REFERENCES locations(id)   ON DELETE SET NULL,
  employment_type      TEXT NOT NULL DEFAULT 'full_time'
                       CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern', 'temp')),
  comp_min             NUMERIC(12, 2) CHECK (comp_min IS NULL OR comp_min >= 0),
  comp_max             NUMERIC(12, 2) CHECK (comp_max IS NULL OR comp_max >= 0),
  comp_currency        TEXT NOT NULL DEFAULT 'USD',
  comp_band_id         UUID REFERENCES compensation_bands(id) ON DELETE SET NULL,
  out_of_band          BOOLEAN NOT NULL DEFAULT false,    -- auto-set when comp overrides band
  target_start_date    DATE,
  hiring_manager_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  recruiter_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  justification        TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'pending_approval', 'approved',
                                         'open', 'filled', 'closed', 'archived')),
  approval_id          UUID,                              -- FK added after approvals migration
  custom_fields        JSONB NOT NULL DEFAULT '{}',
  created_by           UUID NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When submitting for approval the API enforces justification length >= 50.
  -- We keep the DB constraint lax (allow short/null in draft).
  CONSTRAINT openings_comp_range_valid CHECK (
    comp_min IS NULL OR comp_max IS NULL OR comp_min <= comp_max
  )
);

CREATE INDEX IF NOT EXISTS idx_openings_org               ON openings(org_id);
CREATE INDEX IF NOT EXISTS idx_openings_org_status        ON openings(org_id, status);
CREATE INDEX IF NOT EXISTS idx_openings_department        ON openings(department_id);
CREATE INDEX IF NOT EXISTS idx_openings_location          ON openings(location_id);
CREATE INDEX IF NOT EXISTS idx_openings_hm                ON openings(hiring_manager_id);
CREATE INDEX IF NOT EXISTS idx_openings_recruiter         ON openings(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_openings_external_id       ON openings(org_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE TRIGGER set_openings_updated_at
  BEFORE UPDATE ON openings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_openings" ON openings FOR ALL USING (true) WITH CHECK (true);

-- ── job_openings ─────────────────────────────────────────────
-- M2M: one job can fill multiple openings; rare, but a single
-- opening could be "served by" multiple jobs in reorg scenarios.
CREATE TABLE IF NOT EXISTS job_openings (
  job_id       UUID NOT NULL REFERENCES jobs(id)     ON DELETE CASCADE,
  opening_id   UUID NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (job_id, opening_id)
);

CREATE INDEX IF NOT EXISTS idx_job_openings_job      ON job_openings(job_id);
CREATE INDEX IF NOT EXISTS idx_job_openings_opening  ON job_openings(opening_id);

ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_job_openings" ON job_openings FOR ALL USING (true) WITH CHECK (true);

-- ── job_postings ─────────────────────────────────────────────
-- The public-facing ad. A job can have N postings (careers page,
-- LinkedIn, Indeed, language/location variants).
-- No independent approval — inherits from the parent job.
CREATE TABLE IF NOT EXISTS job_postings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,                      -- can differ from job.title for SEO
  description          TEXT,                               -- public JD
  location_text        TEXT,                               -- display, e.g. "San Francisco, CA or Remote (US)"
  external_location    JSONB,                              -- {city, state, country, remote_type} for feeds
  application_form_id  UUID,                               -- future application forms module
  channel              TEXT NOT NULL DEFAULT 'careers_page'
                       CHECK (channel IN ('careers_page', 'linkedin', 'indeed', 'glassdoor', 'custom')),
  channel_config       JSONB NOT NULL DEFAULT '{}',        -- channel-specific settings
  is_live              BOOLEAN NOT NULL DEFAULT false,
  published_at         TIMESTAMPTZ,
  unpublished_at       TIMESTAMPTZ,
  created_by           UUID NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_job        ON job_postings(job_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_live       ON job_postings(is_live) WHERE is_live = true;
CREATE INDEX IF NOT EXISTS idx_job_postings_channel    ON job_postings(channel);

CREATE TRIGGER set_job_postings_updated_at
  BEFORE UPDATE ON job_postings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_job_postings" ON job_postings FOR ALL USING (true) WITH CHECK (true);
