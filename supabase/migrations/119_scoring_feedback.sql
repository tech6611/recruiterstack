-- 119_scoring_feedback.sql
--
-- Stage 1 of the ICP LEARNING LOOP: the data substrate.
--
-- The problem this solves: when a recruiter decides Yes/No/Maybe on a candidate,
-- the AI's prediction (ai_criterion_scores, ai_score, …) and the candidate's
-- profile can both be OVERWRITTEN later (a re-score, a re-enrichment). If a future
-- learning model read those live values it would be training on data that didn't
-- exist at decision time — a classic leak. So we freeze a POINT-IN-TIME snapshot of
-- (features + prediction + the human decision) the instant a decision is made.
--
-- This migration is pure substrate: nothing reads scoring_feedback to change scoring
-- yet. It just accumulates clean, immutable training rows, and makes the existing
-- "Refine ICP from feedback" loop able to read a proper history.
--
-- It also lays two pieces of ICP-EVOLUTION groundwork on the (already versioned)
-- icps table: a persisted per-version embedding (for job-to-job similarity, so a
-- future learner can pool decisions across similar roles) and a `derived_from` blob
-- recording WHY each version exists and what drove it.

-- ── The decision log ────────────────────────────────────────────────────────────
-- Append-only. One row per decision event: an immutable training example.
CREATE TABLE IF NOT EXISTS scoring_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         text NOT NULL,

  -- who was decided, on which job (application_id is null for pre-application
  -- decisions made on sourced candidates)
  job_id         uuid NOT NULL,
  candidate_id   uuid NOT NULL,
  application_id uuid,
  source         text NOT NULL DEFAULT 'application', -- 'application' | 'sourcing'

  -- THE LABEL — the human's verdict, and enough context to weight it later
  decision       text NOT NULL CHECK (decision IN ('yes', 'no', 'maybe')),
  decided_at     timestamptz NOT NULL DEFAULT now(),
  decided_by     text,
  decision_stage text,           -- pipeline stage at decision (a 'no' after an interview weighs more)

  -- THE ICP'S PREDICTION, frozen (the live ai_* columns get overwritten on re-score)
  icp_id         uuid,
  icp_version    integer,
  predicted_score          smallint,   -- 0..100
  predicted_bucket         text,       -- great | good | okay | weak
  predicted_recommendation text,       -- strong_yes | yes | maybe | no
  passed_gates   boolean,
  competency_ratings jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id,name,weight,rating,evidence}] — the feature vector
  gate_failures  jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- CANDIDATE FEATURES, frozen (the profile can be re-enriched later)
  candidate_features jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- {current_title, current_company, experience_years, skills, location, education,
    --  num_roles, total_experience_months, current_tenure_months, avg_tenure_months, last_move_months_ago}
  feature_version smallint NOT NULL DEFAULT 1,  -- bump when the blob's shape changes

  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scoring_feedback_job  ON scoring_feedback(org_id, job_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_scoring_feedback_cand ON scoring_feedback(org_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_scoring_feedback_icp  ON scoring_feedback(icp_id, icp_version);

ALTER TABLE scoring_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_scoring_feedback" ON scoring_feedback;
CREATE POLICY "service_role_all_scoring_feedback" ON scoring_feedback FOR ALL USING (true) WITH CHECK (true);

-- ── ICP evolution groundwork (on the already-versioned icps table) ──────────────
-- Per-version ICP "meaning fingerprint" — today it's computed on the fly at sourcing
-- and discarded. Persisting it (per version) lets a future learner measure which jobs
-- are similar and pool their decisions, and lets us chart how an ICP's meaning drifts.
ALTER TABLE icps ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Why this version exists and what drove it. e.g.
--   { "cause": "generation",   "parent_version": null }
--   { "cause": "regeneration", "parent_version": 8 }
--   { "cause": "feedback",     "parent_version": 8, "decisions_considered": 23 }
--   { "cause": "manual" | "template", ... }
ALTER TABLE icps ADD COLUMN IF NOT EXISTS derived_from jsonb;
