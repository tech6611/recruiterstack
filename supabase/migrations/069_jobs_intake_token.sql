-- ============================================================
-- 069: Hiring-manager intake token for canonical jobs (Phase 3 / C5.5).
--
-- Repoint the legacy hiring-manager INTAKE flow onto canonical `jobs`. An
-- intake is now a canonical `job`: the recruiter creates a draft job with an
-- intake_token, the HM opens /intake/[token], fills the form + reviews an
-- AI-generated JD (stored in jobs.description), and on submit the job goes
-- live (status 'open', apply-ready via the apply_token from migration 068).
-- Structured intake fields + HM name/email live in jobs.custom_fields (JSONB).
--
-- This mirrors jobs.apply_token (migration 068): adds `jobs.intake_token`, a
-- BEFORE INSERT trigger that auto-generates it when null, and backfills.
--
-- Additive/reversible & idempotent: re-runnable; rollback = drop column +
-- trigger + function.
-- ============================================================

-- 1. Add intake_token to jobs (hiring-manager intake URL)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS intake_token TEXT UNIQUE;

-- 2. Backfill tokens for existing rows
UPDATE jobs
SET intake_token = gen_random_uuid()::TEXT
WHERE intake_token IS NULL;

-- 3. Auto-generate intake_token on new jobs
CREATE OR REPLACE FUNCTION set_job_intake_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.intake_token IS NULL THEN
    NEW.intake_token := gen_random_uuid()::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_intake_token ON jobs;
CREATE TRIGGER trg_set_job_intake_token
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_intake_token();
