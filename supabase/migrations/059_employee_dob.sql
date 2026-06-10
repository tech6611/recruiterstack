-- ============================================================
-- 059: employee_profiles.date_of_birth
--
-- Adds DOB to the canonical employee record. Useful immediately for:
--   1. Payroll v1.2 80DDB senior-flag derivation (treatment for 60+
--      patients raises the cap from ₹40k to ₹1L). Today we ask the
--      employee to tick a checkbox; with DOB on file the compute
--      orchestrator can derive it instead.
--   2. Future age-cohort analytics on tenure / retention.
--   3. Future retirement-eligibility workflows (Indian PF age 58).
--
-- Nullable — most existing employees don't have it on file yet, and we
-- don't want to backfill with fake data. The 80DDB derivation in the
-- engine uses the column when present, falls back to the existing
-- checkbox flag otherwise (additive, not breaking).
-- ============================================================

ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- No index needed — we'll only ever look up DOB joined to a specific
-- employee row, and (org_id, id) is already indexed.
