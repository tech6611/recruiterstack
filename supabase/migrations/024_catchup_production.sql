-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 024: Production catch-up
-- Applies every column / table addition from migrations 002–023 in one shot.
-- Completely idempotent — safe to re-run on any DB state.
-- Run this once in the Supabase SQL editor if any of 002–023 was skipped.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── From 002: hiring_request enhancements ─────────────────────────────────────
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS ticket_number       TEXT,
  ADD COLUMN IF NOT EXISTS target_companies    TEXT,
  ADD COLUMN IF NOT EXISTS filled_by_recruiter BOOLEAN NOT NULL DEFAULT FALSE;

-- Make hiring_manager_email nullable (was NOT NULL in base schema)
ALTER TABLE hiring_requests
  ALTER COLUMN hiring_manager_email DROP NOT NULL;

-- Sequence + ticket-number auto-generation (safe to re-create)
CREATE SEQUENCE IF NOT EXISTS hiring_request_seq START 1;

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v BIGINT;
BEGIN
  v := nextval('hiring_request_seq');
  RETURN 'REQ-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v::TEXT, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION set_ticket_number_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ticket_number ON hiring_requests;
CREATE TRIGGER trg_set_ticket_number
  BEFORE INSERT ON hiring_requests
  FOR EACH ROW EXECUTE FUNCTION set_ticket_number_on_insert();

-- Backfill rows that have no ticket number
UPDATE hiring_requests
  SET ticket_number = generate_ticket_number()
  WHERE ticket_number IS NULL;

-- ADD CONSTRAINT IF NOT EXISTS is not valid syntax — use DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hiring_requests_ticket_number_key'
  ) THEN
    ALTER TABLE hiring_requests ADD CONSTRAINT hiring_requests_ticket_number_key UNIQUE (ticket_number);
  END IF;
END;
$$;

-- ── From 003: apply_link_token on hiring_requests ─────────────────────────────
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS apply_link_token TEXT;

UPDATE hiring_requests
  SET apply_link_token = gen_random_uuid()::TEXT
  WHERE apply_link_token IS NULL;

-- ── From 004: linkedin_url on candidates ──────────────────────────────────────
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- ── From 006: AI scoring columns on applications ──────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_score          SMALLINT
    CHECK (ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100)),
  ADD COLUMN IF NOT EXISTS ai_recommendation TEXT
    CHECK (ai_recommendation IS NULL OR
           ai_recommendation IN ('strong_yes', 'yes', 'maybe', 'no')),
  ADD COLUMN IF NOT EXISTS ai_strengths      TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_gaps           TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_scored_at      TIMESTAMPTZ;

-- From 006: Autopilot settings on hiring_requests
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS auto_advance_score       SMALLINT
    CHECK (auto_advance_score IS NULL OR (auto_advance_score >= 0 AND auto_advance_score <= 100)),
  ADD COLUMN IF NOT EXISTS auto_reject_score        SMALLINT
    CHECK (auto_reject_score IS NULL OR (auto_reject_score >= 0 AND auto_reject_score <= 100)),
  ADD COLUMN IF NOT EXISTS auto_advance_stage_id    UUID
    REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_email_rejection     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS autopilot_recruiter_name TEXT,
  ADD COLUMN IF NOT EXISTS autopilot_company_name   TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_ai_score
  ON applications(hiring_request_id, ai_score DESC NULLS LAST)
  WHERE status = 'active';

-- ── From 007: org_id on pipeline_stages (if not already present) ──────────────
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS org_id TEXT;

-- ── From 017: scoring_criteria on hiring_requests ─────────────────────────────
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS scoring_criteria JSONB;

-- ── From 018: ai_criterion_scores on applications ────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_criterion_scores JSONB;

-- ── From 019: credited_to on applications + new tables ───────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS credited_to TEXT;

CREATE TABLE IF NOT EXISTS candidate_tasks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id  UUID        REFERENCES applications(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  due_date        DATE,
  assignee_name   TEXT,
  completed_at    TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'to_do'
    CONSTRAINT candidate_tasks_status_check
      CHECK (status IN ('to_do', 'in_progress', 'done', 'blocked')),
  created_by      TEXT        NOT NULL DEFAULT 'Recruiter',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_candidate_tasks_candidate ON candidate_tasks(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_tasks_org ON candidate_tasks(org_id);
ALTER TABLE candidate_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS candidate_tags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL,
  candidate_id  UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  tag           TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, candidate_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_candidate_tags_candidate ON candidate_tags(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_tags_org ON candidate_tags(org_id);
ALTER TABLE candidate_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS candidate_referrals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id  UUID        REFERENCES applications(id) ON DELETE SET NULL,
  referrer_name   TEXT        NOT NULL,
  referrer_email  TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_candidate_referrals_candidate ON candidate_referrals(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_referrals_org ON candidate_referrals(org_id);
ALTER TABLE candidate_referrals ENABLE ROW LEVEL SECURITY;

-- ── From 020: email_templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  subject      TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_templates_org_idx ON email_templates(org_id);
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- ── From 021 + 022: email_drafts (multi-draft, Gmail-style) ──────────────────
CREATE TABLE IF NOT EXISTS email_drafts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT        NOT NULL,
  application_id TEXT        NOT NULL,
  name           TEXT        NOT NULL DEFAULT '',
  to_emails      TEXT[]      NOT NULL DEFAULT '{}',
  cc_emails      TEXT[]      NOT NULL DEFAULT '{}',
  bcc_emails     TEXT[]      NOT NULL DEFAULT '{}',
  subject        TEXT        NOT NULL DEFAULT '',
  body           TEXT        NOT NULL DEFAULT '',
  created_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Drop old single-draft unique index if it exists (migration 022 removes it)
DROP INDEX IF EXISTS email_drafts_app_org_idx;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

-- ── RLS policies (service role / anon read-only pattern) ──────────────────────
DO $$
BEGIN
  -- candidate_tasks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'candidate_tasks' AND policyname = 'service_role_all_tasks'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_tasks" ON candidate_tasks FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  -- candidate_tags
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'candidate_tags' AND policyname = 'service_role_all_tags'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_tags" ON candidate_tags FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  -- candidate_referrals
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'candidate_referrals' AND policyname = 'service_role_all_referrals'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_referrals" ON candidate_referrals FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  -- email_templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'email_templates' AND policyname = 'service_role_all_templates'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_templates" ON email_templates FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  -- email_drafts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'email_drafts' AND policyname = 'service_role_all_drafts'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_drafts" ON email_drafts FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END;
$$;
