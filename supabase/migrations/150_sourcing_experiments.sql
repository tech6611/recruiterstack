-- 150_sourcing_experiments.sql
-- Persistent, job-scoped A/B market-sourcing experiments. Each row preserves the
-- two generated strategies, compiled source plans, externally acquired candidate
-- cards, spend, and recruiter decisions without changing the job's live ICP.

CREATE TABLE IF NOT EXISTS sourcing_experiments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            text NOT NULL,
  job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  count_per_variant int NOT NULL DEFAULT 5 CHECK (count_per_variant BETWEEN 1 AND 15),
  baseline          jsonb NOT NULL DEFAULT '{}'::jsonb,
  challenger        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  error             text
);

CREATE INDEX IF NOT EXISTS idx_sourcing_experiments_job
  ON sourcing_experiments (org_id, job_id, created_at DESC);

ALTER TABLE sourcing_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_sourcing_experiments"
  ON sourcing_experiments FOR ALL USING (true) WITH CHECK (true);
