-- 120_data_incomplete_flag.sql
--
-- Part B of the background-gate work: when a candidate has NO education AND NO work
-- history on file, a background/identity deal-breaker ("is this a genuine engineer?")
-- can't be verified.
--   - Internal / applied candidates → FLAGGED (not rejected): the recruiter sees an
--     "incomplete profile — background unverified" marker and can enrich or eyeball them.
--   - Market / sourced candidates → REJECTED at score time (a synthetic gate failure,
--     which already lands in the existing gate_failures jsonb — no column needed there).
--
-- These two boolean columns persist the FLAG for the internal paths so the cached
-- sourcing cards + the candidate's AI assessment can show the marker.

ALTER TABLE sourcing_matches ADD COLUMN IF NOT EXISTS data_incomplete boolean NOT NULL DEFAULT false;
ALTER TABLE applications     ADD COLUMN IF NOT EXISTS ai_data_incomplete boolean NOT NULL DEFAULT false;
