-- 099_interview_plans.sql
-- Per-job Hiring Plan: an ordered list of interview rounds.
-- Fills the `jobs.interview_plan_id` placeholder reserved in 035 ("future module").
-- Reuses existing concepts (interview_type, pipeline_stages, scorecards); adds no enums.

CREATE TABLE IF NOT EXISTS interview_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id)
);

CREATE TABLE IF NOT EXISTS interview_plan_rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT NOT NULL,
  plan_id             UUID NOT NULL REFERENCES interview_plans(id) ON DELETE CASCADE,
  order_index         INT  NOT NULL DEFAULT 0,
  name                TEXT NOT NULL,
  interview_type      TEXT NOT NULL DEFAULT 'video',
  duration_minutes    INT  NOT NULL DEFAULT 45,
  interviewer_role    TEXT,                                          -- a role, e.g. "Hiring Manager", when no specific person yet
  interviewer_user_id UUID,                                          -- a specific person (wired to the hiring team in a later phase)
  interviewer_name    TEXT,                                          -- denormalized display name for the chosen person
  stage_id            UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  scorecard_id        UUID,                                          -- optional scorecard template (wired later)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_plans_job          ON interview_plans(job_id);
CREATE INDEX IF NOT EXISTS idx_interview_plan_rounds_plan   ON interview_plan_rounds(plan_id, order_index);

-- Access is via the service-role server client (RLS bypassed there); enable RLS
-- with a permissive service-role policy, matching the rest of the schema.
ALTER TABLE interview_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_plan_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_interview_plans"       ON interview_plans       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_interview_plan_rounds" ON interview_plan_rounds FOR ALL USING (true) WITH CHECK (true);
