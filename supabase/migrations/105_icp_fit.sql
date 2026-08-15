-- 105_icp_fit.sql
-- Fit Engine (Component 06): persist the richer, ICP-driven scoring output.
--
-- Today's Sifter writes ai_score / ai_recommendation / ai_strengths / ai_gaps /
-- ai_criterion_scores and discards the free-text reasoning. When a job has an
-- approved ICP the Fit Engine additionally produces: hard-gate outcomes, red
-- flags, a persisted rationale, and a Great/Good/Okay fit bucket. It REUSES the
-- existing applications.knockout_failed (gate flag) and ai_criterion_scores (now
-- carries per-competency `evidence` in its JSON) — this migration only adds the
-- genuinely new columns. All nullable / defaulted so legacy scoring is untouched.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_red_flags     jsonb NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  ADD COLUMN IF NOT EXISTS ai_rationale     text,                                -- the "why", now persisted
  ADD COLUMN IF NOT EXISTS ai_fit_bucket    text,                                -- great | good | okay
  ADD COLUMN IF NOT EXISTS ai_gate_failures jsonb NOT NULL DEFAULT '[]'::jsonb,  -- IcpMustHave[] that failed
  ADD COLUMN IF NOT EXISTS ai_icp_id        uuid,                                -- which ICP version scored this
  ADD COLUMN IF NOT EXISTS ai_icp_version   int;

-- Cheap lookup for "which applications were scored against ICP X" (audit / re-score).
CREATE INDEX IF NOT EXISTS idx_applications_ai_icp ON applications (ai_icp_id);
