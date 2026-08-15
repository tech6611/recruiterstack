-- 106_sourcing_matches.sql
-- Sourcing (Component 05, Slice 5a): a cache of ICP-driven candidate matches per job.
--
-- When a recruiter runs "Source" on a job, we pre-filter the candidate pool by
-- overlap with the approved ICP, Fit-Engine the shortlist, and store the result
-- here — so the Source view is instant on reload and auditable. A row is STALE when
-- its icp_version != the job's current approved ICP version (surfaced as a refresh
-- prompt). One row per (job, candidate); re-running sourcing upserts.

CREATE TABLE IF NOT EXISTS sourcing_matches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         text NOT NULL,
  job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id   uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  score          int  NOT NULL DEFAULT 0,             -- 0–100 Fit Engine score
  fit_bucket     text,                                 -- great | good | okay
  recommendation text,                                 -- strong_yes | yes | maybe | no
  gate_failures  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- IcpMustHave[] that failed
  red_flags      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- string[]
  rationale      text,
  competencies   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ name, rating, evidence }]
  icp_id         uuid,                                 -- which ICP produced this match
  icp_version    int,                                  -- for staleness detection
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_matches_job ON sourcing_matches (job_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_matches_org ON sourcing_matches (org_id);

ALTER TABLE sourcing_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_sourcing_matches" ON sourcing_matches FOR ALL USING (true) WITH CHECK (true);
