-- 155_bet_sample_decisions.sql
-- Scoring tab: each bet shows one real sample person from the Candidate Pool, and the
-- recruiter marks them 👍 / 👎. One row per (org, job, bet, person) — deciding again
-- updates it. The person's profile and the bet's profile lines are frozen at decision
-- time, so the verdict can later train the ICP even after the pool record changes.
--
-- Pool people are not ATS candidates (scoring_feedback.candidate_id is NOT NULL and
-- points at candidates), hence a table of their own.

CREATE TABLE IF NOT EXISTS bet_sample_decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  bet         int  NOT NULL,
  bet_label   text,
  profile_id  uuid NOT NULL REFERENCES pool_profiles(id) ON DELETE CASCADE,
  decision    text NOT NULL CHECK (decision IN ('yes', 'no')),
  icp_id      uuid,
  criteria    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- the bet's profile lines when decided
  checks      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- per-line ✓ / ✗ / ? shown to the recruiter
  person      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- title, company, years, location, education
  decided_by  text,
  decided_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, job_id, bet, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_bet_sample_decisions_job ON bet_sample_decisions (org_id, job_id);

ALTER TABLE bet_sample_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_bet_sample_decisions" ON bet_sample_decisions FOR ALL USING (true) WITH CHECK (true);
