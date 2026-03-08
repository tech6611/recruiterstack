-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: AI Scoring & Autopilot Engine
-- ─────────────────────────────────────────────────────────────────────────────
-- All statements are additive (IF NOT EXISTS / IF NOT EXISTS equivalent).
-- Safe to run on an already-migrated database — will no-op gracefully.

-- ── 1. AI score columns on applications ──────────────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_score          SMALLINT
    CHECK (ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100)),
  ADD COLUMN IF NOT EXISTS ai_recommendation TEXT
    CHECK (ai_recommendation IS NULL OR
           ai_recommendation IN ('strong_yes', 'yes', 'maybe', 'no')),
  ADD COLUMN IF NOT EXISTS ai_strengths      TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_gaps           TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_scored_at      TIMESTAMPTZ;

-- ── 2. Autopilot settings on hiring_requests ─────────────────────────────────
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS auto_advance_score      SMALLINT
    CHECK (auto_advance_score IS NULL OR (auto_advance_score >= 0 AND auto_advance_score <= 100)),
  ADD COLUMN IF NOT EXISTS auto_reject_score       SMALLINT
    CHECK (auto_reject_score IS NULL OR (auto_reject_score >= 0 AND auto_reject_score <= 100)),
  ADD COLUMN IF NOT EXISTS auto_advance_stage_id   UUID
    REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_email_rejection    BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS autopilot_recruiter_name TEXT,
  ADD COLUMN IF NOT EXISTS autopilot_company_name   TEXT;

-- ── 3. Performance index for Ranked View ─────────────────────────────────────
-- Powers "fetch all scored active applications for a job sorted by score DESC"
-- Sub-millisecond even at thousands of applications.
CREATE INDEX IF NOT EXISTS idx_applications_ai_score
  ON applications(hiring_request_id, ai_score DESC NULLS LAST)
  WHERE status = 'active';
