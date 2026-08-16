-- 112_screening_sessions.sql
-- AI Screening (Component 07). A short, AI-conducted screening "interview": the
-- recruiter generates ICP-targeted questions, shares a private tokenized link, the
-- candidate answers async (no login), and the AI scores the answers against the
-- job's ICP competencies. One row per screen. Questions/answers/result are JSONB
-- (variable shape, read with the row), status is TEXT + app-level (Zod) validation
-- — no new enums, matching the icps/interview_plans convention.

CREATE TABLE IF NOT EXISTS screening_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         text NOT NULL,
  job_id         uuid REFERENCES jobs(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  candidate_id   uuid REFERENCES candidates(id) ON DELETE CASCADE,
  icp_version    int,
  token          text NOT NULL UNIQUE,               -- candidate link token
  status         text NOT NULL DEFAULT 'pending',    -- pending | completed | expired
  questions      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- {id, text, competency_id}[]
  answers        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- {question_id, answer}[]
  result         jsonb,                               -- {score, fit_bucket, competencies[], summary, recommendation}
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_screening_sessions_app ON screening_sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_screening_sessions_candidate ON screening_sessions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_screening_sessions_org ON screening_sessions(org_id, created_at DESC);

ALTER TABLE screening_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_screening_sessions" ON screening_sessions FOR ALL USING (true) WITH CHECK (true);
