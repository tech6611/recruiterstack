-- ============================================================
-- Requisition Module — combined apply script (migrations 032–039)
-- Run in Supabase SQL Editor. Wrapped in a transaction: if any
-- statement fails, nothing is applied.
-- ============================================================

BEGIN;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/032_users_and_org_members.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 032: Users mirror table + org_members with role
-- Requisition Module step 1 — identity layer.
-- Every subsequent FK to a human (hiring_manager_id, approver, etc.)
-- points at users.id, NOT at Clerk's raw user_xxx string.
-- ============================================================

-- ── users ────────────────────────────────────────────────────
-- Mirror of Clerk users. Populated via Clerk webhooks.
-- id is our internal UUID; clerk_user_id is the Clerk pointer.
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id      TEXT NOT NULL UNIQUE,
  email              TEXT NOT NULL,
  first_name         TEXT,
  last_name          TEXT,
  full_name          TEXT,                  -- denormalized convenience
  avatar_url         TEXT,
  -- OOO / delegation (prompt: "Approver is deactivated or OOO"):
  delegate_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  deactivated_at     TIMESTAMPTZ,           -- null = active
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active        ON users(deactivated_at) WHERE deactivated_at IS NULL;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_users" ON users FOR ALL USING (true) WITH CHECK (true);

-- ── org_members ──────────────────────────────────────────────
-- A user's membership in an org, with our custom role.
-- Sourced from Clerk's org membership, but we store our own
-- role (admin / recruiter / hiring_manager / interviewer)
-- because Clerk only has admin / basic_member.
-- "Approver" is NOT a role here — it's dynamically resolved
-- per approval step (via chain step approver_type/value).
CREATE TABLE IF NOT EXISTS org_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'recruiter'
                  CHECK (role IN ('admin', 'recruiter', 'hiring_manager', 'interviewer')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org     ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user    ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role    ON org_members(org_id, role);

CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON org_members
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_org_members" ON org_members FOR ALL USING (true) WITH CHECK (true);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/033_departments_locations.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 033: Departments + Locations — org-scoped reference tables.
-- Both are admin-configured lookups used by openings/jobs.
-- ============================================================

-- ── departments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT,                   -- optional URL-friendly form, e.g. "engineering"
  parent_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_org     ON departments(org_id);
CREATE INDEX IF NOT EXISTS idx_departments_active  ON departments(org_id, is_active);

CREATE TRIGGER set_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_departments" ON departments FOR ALL USING (true) WITH CHECK (true);

-- ── locations ────────────────────────────────────────────────
-- Structured for posting feeds (Indeed XML, LinkedIn) + comp-band matching.
CREATE TABLE IF NOT EXISTS locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  name         TEXT NOT NULL,        -- display name, e.g. "San Francisco HQ"
  city         TEXT,
  state        TEXT,
  country      TEXT,                 -- ISO 3166-1 alpha-2, e.g. "US"
  postal_code  TEXT,
  remote_type  TEXT NOT NULL DEFAULT 'onsite'
               CHECK (remote_type IN ('onsite', 'remote', 'hybrid')),
  timezone     TEXT,                 -- IANA tz, e.g. "America/Los_Angeles"
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_locations_org         ON locations(org_id);
CREATE INDEX IF NOT EXISTS idx_locations_active      ON locations(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_locations_country     ON locations(country);

CREATE TRIGGER set_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_locations" ON locations FOR ALL USING (true) WITH CHECK (true);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/034_compensation_bands.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 034: Compensation Bands
-- Admin-configured salary bands keyed by (level, dept, location).
-- Openings auto-fill min/max from the matching band; explicit
-- override sets openings.out_of_band = true.
-- ============================================================

CREATE TABLE IF NOT EXISTS compensation_bands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  name            TEXT NOT NULL,                       -- e.g. "IC4 Engineer — SF"
  level           TEXT NOT NULL,                       -- e.g. "IC4", "L5", "Senior"
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  location_id     UUID REFERENCES locations(id)   ON DELETE SET NULL,
  min_salary      NUMERIC(12, 2) NOT NULL CHECK (min_salary >= 0),
  max_salary      NUMERIC(12, 2) NOT NULL CHECK (max_salary >= 0),
  currency        TEXT NOT NULL DEFAULT 'USD',         -- ISO 4217
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comp_band_salary_range_valid CHECK (min_salary <= max_salary)
);

CREATE INDEX IF NOT EXISTS idx_comp_bands_org          ON compensation_bands(org_id);
CREATE INDEX IF NOT EXISTS idx_comp_bands_active       ON compensation_bands(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_comp_bands_match        ON compensation_bands(org_id, level, department_id, location_id)
  WHERE is_active = true;

CREATE TRIGGER set_comp_bands_updated_at
  BEFORE UPDATE ON compensation_bands
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE compensation_bands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_comp_bands" ON compensation_bands FOR ALL USING (true) WITH CHECK (true);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/035_requisitions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/036_approvals.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 036: Approval Engine
-- Template (chain + chain_steps) / instance (approval + steps)
-- split. Polymorphic target (opening | job | offer-later).
-- Audit log scoped to this module.
-- ============================================================

-- ── approval_chains ──────────────────────────────────────────
-- Admin-defined templates. Multiple chains can exist per
-- target_type; scope_conditions select which one applies.
CREATE TABLE IF NOT EXISTS approval_chains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  target_type      TEXT NOT NULL
                   CHECK (target_type IN ('opening', 'job', 'offer')),
  scope_conditions JSONB,                                  -- DSL; null = matches all targets
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_chains_org         ON approval_chains(org_id);
CREATE INDEX IF NOT EXISTS idx_approval_chains_lookup      ON approval_chains(org_id, target_type, is_active);

CREATE TRIGGER set_approval_chains_updated_at
  BEFORE UPDATE ON approval_chains
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE approval_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approval_chains" ON approval_chains FOR ALL USING (true) WITH CHECK (true);

-- ── approval_chain_steps ─────────────────────────────────────
-- Template steps. parallel_group_id groups sibling steps
-- that run concurrently. Sequential steps have a null group.
CREATE TABLE IF NOT EXISTS approval_chain_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id           UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  step_index         INT NOT NULL CHECK (step_index >= 0),
  name               TEXT NOT NULL,
  step_type          TEXT NOT NULL DEFAULT 'sequential'
                     CHECK (step_type IN ('sequential', 'parallel')),
  parallel_group_id  UUID,                                 -- steps sharing this run in parallel
  condition          JSONB,                                -- null = unconditional; DSL otherwise
  approver_type      TEXT NOT NULL
                     CHECK (approver_type IN ('user', 'role', 'hiring_team_member', 'group')),
  approver_value     JSONB NOT NULL,                       -- {user_id} | {role} | {role: 'hiring_manager'} | {group_id}
  min_approvals      INT NOT NULL DEFAULT 1 CHECK (min_approvals >= 1),
  sla_hours          INT CHECK (sla_hours IS NULL OR sla_hours > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_chain_steps_chain     ON approval_chain_steps(chain_id, step_index);
CREATE INDEX IF NOT EXISTS idx_chain_steps_group     ON approval_chain_steps(chain_id, parallel_group_id)
  WHERE parallel_group_id IS NOT NULL;

ALTER TABLE approval_chain_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_chain_steps" ON approval_chain_steps FOR ALL USING (true) WITH CHECK (true);

-- ── approvals ────────────────────────────────────────────────
-- An instantiated approval request. Polymorphic target.
-- Only one active (pending) approval per (target_type, target_id)
-- at a time — enforced by partial unique index below.
CREATE TABLE IF NOT EXISTS approvals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT NOT NULL,
  approval_chain_id    UUID NOT NULL REFERENCES approval_chains(id) ON DELETE RESTRICT,
  target_type          TEXT NOT NULL
                       CHECK (target_type IN ('opening', 'job', 'offer')),
  target_id            UUID NOT NULL,                      -- polymorphic; FK enforced by service layer
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  current_step_index   INT NOT NULL DEFAULT 0,
  requested_by         UUID NOT NULL REFERENCES users(id),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_org             ON approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_approvals_target          ON approvals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status          ON approvals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_chain           ON approvals(approval_chain_id);

-- "Only one active approval per target" — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_approvals_active_per_target
  ON approvals (target_type, target_id)
  WHERE status = 'pending';

CREATE TRIGGER set_approvals_updated_at
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approvals" ON approvals FOR ALL USING (true) WITH CHECK (true);

-- ── approval_steps ───────────────────────────────────────────
-- Instance steps. approvers and decisions are resolved/recorded
-- at runtime. `approvers` snapshots user_ids at step-activation
-- so a later org membership change doesn't retroactively alter
-- who was asked.
CREATE TABLE IF NOT EXISTS approval_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id        UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  chain_step_id      UUID NOT NULL REFERENCES approval_chain_steps(id) ON DELETE RESTRICT,
  step_index         INT NOT NULL,
  parallel_group_id  UUID,                                  -- mirrored from template at instantiation
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'skipped', 'not_applicable')),
  approvers          JSONB NOT NULL DEFAULT '[]',           -- array of {user_id}
  decisions          JSONB NOT NULL DEFAULT '[]',           -- array of {user_id, decision, comment, at}
  min_approvals      INT NOT NULL DEFAULT 1,
  due_at             TIMESTAMPTZ,                           -- SLA deadline
  activated_at       TIMESTAMPTZ,                           -- when step became 'pending' actively
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_approval    ON approval_steps(approval_id, step_index);
CREATE INDEX IF NOT EXISTS idx_approval_steps_pending     ON approval_steps(status, due_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approval_steps_chain_step  ON approval_steps(chain_step_id);

ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approval_steps" ON approval_steps FOR ALL USING (true) WITH CHECK (true);

-- ── approval_audit_log ───────────────────────────────────────
-- Every state change, decision, and mid-approval edit.
-- Scoped to this module (distinct from application_events).
CREATE TABLE IF NOT EXISTS approval_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  approval_id     UUID REFERENCES approvals(id) ON DELETE SET NULL,
  target_type     TEXT,                                    -- denormalized for querying after approval delete
  target_id       UUID,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,  -- null = system action
  action          TEXT NOT NULL,                           -- e.g. 'submitted', 'approved', 'rejected',
                                                           -- 'step_decided', 'edit_cancelled', 'sla_breach'
  from_state      TEXT,
  to_state        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org           ON approval_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_approval      ON approval_audit_log(approval_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target        ON approval_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor         ON approval_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created       ON approval_audit_log(created_at DESC);

ALTER TABLE approval_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_audit_log" ON approval_audit_log FOR ALL USING (true) WITH CHECK (true);

-- ── deferred FKs from migration 035 ──────────────────────────
-- openings.approval_id and jobs.approval_id point here now.
ALTER TABLE openings
  ADD CONSTRAINT openings_approval_id_fkey
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_approval_id_fkey
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/037_custom_fields.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 037: Custom Field Definitions
-- Per-org metadata: what fields to render on Opening/Job/Posting
-- forms beyond the built-ins. Values live in the target row's
-- custom_fields JSONB column (keyed by field_key).
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  object_type  TEXT NOT NULL
               CHECK (object_type IN ('opening', 'job', 'posting')),
  field_key    TEXT NOT NULL,                              -- stable key stored in JSONB
  label        TEXT NOT NULL,                              -- human display label
  field_type   TEXT NOT NULL
               CHECK (field_type IN ('text', 'number', 'select', 'multi_select',
                                     'date', 'boolean', 'user')),
  options      JSONB,                                      -- [{value, label}] for select/multi_select
  required     BOOLEAN NOT NULL DEFAULT false,
  order_index  INT NOT NULL DEFAULT 0,                     -- form ordering
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, object_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_org_obj  ON custom_field_definitions(org_id, object_type)
  WHERE is_active = true;

CREATE TRIGGER set_custom_fields_updated_at
  BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_custom_fields" ON custom_field_definitions FOR ALL USING (true) WITH CHECK (true);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/038_webhooks.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 038: Webhook Subscriptions + Deliveries
-- Customers declare endpoints + event filters; emitter records
-- deliveries and retries via the existing job_queue table.
-- HMAC-SHA256 signing with a per-subscription secret.
-- ============================================================

-- ── webhook_subscriptions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT NOT NULL,
  name           TEXT NOT NULL,                            -- admin-facing label
  url            TEXT NOT NULL,
  event_types    TEXT[] NOT NULL DEFAULT '{}',             -- e.g. {'opening.approved','job.published'}
  secret         TEXT NOT NULL,                            -- signing secret (return-once at creation)
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_org     ON webhook_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active  ON webhook_subscriptions(org_id, is_active)
  WHERE is_active = true;
-- GIN index for "which subs care about this event?" queries.
CREATE INDEX IF NOT EXISTS idx_webhook_subs_events  ON webhook_subscriptions USING GIN (event_types);

CREATE TRIGGER set_webhook_subs_updated_at
  BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_webhook_subs" ON webhook_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ── webhook_deliveries ───────────────────────────────────────
-- One row per attempted delivery. On failure, the worker
-- re-enqueues a new delivery row via job_queue.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  subscription_id  UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  event_id         UUID NOT NULL,                          -- stable id for dedup on consumer side
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'delivered', 'failed')),
  attempt          INT NOT NULL DEFAULT 0,
  response_status  INT,                                    -- HTTP status code from target
  response_body    TEXT,                                   -- truncated for log inspection
  error            TEXT,                                   -- local error (timeout, DNS, etc.)
  scheduled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org         ON webhook_deliveries(org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub         ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending     ON webhook_deliveries(status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event       ON webhook_deliveries(event_type, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_webhook_deliveries" ON webhook_deliveries FOR ALL USING (true) WITH CHECK (true);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- supabase/migrations/039_seed_requisition_module.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================
-- 039: Seed data for the Requisition module (local dev / tests)
-- Idempotent via fixed UUIDs + ON CONFLICT DO NOTHING.
-- Org id: 'seed' (matches the convention in migration 007).
-- ============================================================

-- ── users ────────────────────────────────────────────────────
INSERT INTO users (id, clerk_user_id, email, first_name, last_name, full_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'seed_user_alice', 'alice@seed.local', 'Alice',  'Admin',   'Alice Admin'),
  ('00000000-0000-0000-0000-000000000002', 'seed_user_bob',   'bob@seed.local',   'Bob',    'Recruit', 'Bob Recruit'),
  ('00000000-0000-0000-0000-000000000003', 'seed_user_carol', 'carol@seed.local', 'Carol',  'VPEng',   'Carol VPEng')
ON CONFLICT (clerk_user_id) DO NOTHING;

-- ── org_members ──────────────────────────────────────────────
INSERT INTO org_members (org_id, user_id, role) VALUES
  ('seed', '00000000-0000-0000-0000-000000000001', 'admin'),
  ('seed', '00000000-0000-0000-0000-000000000002', 'recruiter'),
  ('seed', '00000000-0000-0000-0000-000000000003', 'hiring_manager')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ── departments ──────────────────────────────────────────────
INSERT INTO departments (id, org_id, name, slug) VALUES
  ('10000000-0000-0000-0000-000000000001', 'seed', 'Engineering', 'engineering'),
  ('10000000-0000-0000-0000-000000000002', 'seed', 'Product',     'product')
ON CONFLICT (org_id, name) DO NOTHING;

-- ── locations ────────────────────────────────────────────────
INSERT INTO locations (id, org_id, name, city, state, country, remote_type, timezone) VALUES
  ('20000000-0000-0000-0000-000000000001', 'seed', 'San Francisco HQ', 'San Francisco', 'CA', 'US', 'onsite', 'America/Los_Angeles'),
  ('20000000-0000-0000-0000-000000000002', 'seed', 'Remote, US',        NULL,            NULL, 'US', 'remote', NULL)
ON CONFLICT (org_id, name) DO NOTHING;

-- ── compensation_bands ───────────────────────────────────────
INSERT INTO compensation_bands (id, org_id, name, level, department_id, location_id, min_salary, max_salary, currency) VALUES
  ('30000000-0000-0000-0000-000000000001', 'seed', 'IC4 Engineer — SF', 'IC4',
   '10000000-0000-0000-0000-000000000001',   -- Engineering
   '20000000-0000-0000-0000-000000000001',   -- SF HQ
   160000, 220000, 'USD')
ON CONFLICT DO NOTHING;

-- ── approval_chains ──────────────────────────────────────────
-- One chain for Openings in the Engineering department:
--   Step 0 (sequential):   Hiring Manager approval (resolved dynamically)
--   Step 1 (conditional):  Finance — only if comp_max > 200000
--   Step 2 (sequential):   VP of Engineering (Carol)
INSERT INTO approval_chains (id, org_id, name, description, target_type, scope_conditions, is_active, created_by) VALUES
  ('40000000-0000-0000-0000-000000000001', 'seed', 'Engineering Opening Approval',
   'Default approval chain for engineering openings',
   'opening',
   '{"all":[{"field":"department_id","op":"eq","value":"10000000-0000-0000-0000-000000000001"}]}'::jsonb,
   true,
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ── approval_chain_steps ─────────────────────────────────────
INSERT INTO approval_chain_steps
  (id, chain_id, step_index, name, step_type, parallel_group_id, condition, approver_type, approver_value, min_approvals, sla_hours)
VALUES
  ('41000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001',
   0,
   'Hiring Manager',
   'sequential',
   NULL,
   NULL,
   'hiring_team_member',
   '{"role":"hiring_manager"}'::jsonb,
   1,
   24),

  ('41000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000001',
   1,
   'Finance (high comp only)',
   'sequential',
   NULL,
   '{"all":[{"field":"comp_max","op":"gt","value":200000}]}'::jsonb,
   'user',
   '{"user_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,   -- Alice (admin) stands in for Finance in seed
   1,
   48),

  ('41000000-0000-0000-0000-000000000003',
   '40000000-0000-0000-0000-000000000001',
   2,
   'VP of Engineering',
   'sequential',
   NULL,
   NULL,
   'user',
   '{"user_id":"00000000-0000-0000-0000-000000000003"}'::jsonb,   -- Carol
   1,
   48)
ON CONFLICT (chain_id, step_index) DO NOTHING;


COMMIT;
