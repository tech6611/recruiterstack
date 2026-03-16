-- Migration 019: Candidate detail page infrastructure
-- Adds candidate_tasks, candidate_tags, candidate_referrals tables
-- and credited_to column on applications

-- ── Candidate Tasks ──────────────────────────────────────────────────────────
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
  created_by      TEXT        NOT NULL DEFAULT 'Recruiter',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_tasks_candidate ON candidate_tasks(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_tasks_org ON candidate_tasks(org_id);

ALTER TABLE candidate_tasks ENABLE ROW LEVEL SECURITY;

-- ── Candidate Tags ────────────────────────────────────────────────────────────
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

-- ── Candidate Referrals ───────────────────────────────────────────────────────
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

-- ── credited_to on applications ───────────────────────────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS credited_to TEXT;
