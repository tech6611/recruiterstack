-- ============================================================
-- 068: Public apply token for canonical jobs (Phase 3 / C3).
--
-- Give canonical `jobs` their own public shareable apply URL, mirroring
-- hiring_requests.apply_link_token (migration 003). Adds `jobs.apply_token`,
-- a BEFORE INSERT trigger that auto-generates it when null, and backfills
-- existing rows. The public /api/apply route resolves this token against
-- canonical jobs and accepts applications when status = 'open'.
--
-- Additive/reversible & idempotent: re-runnable; rollback = drop column +
-- trigger + function.
-- ============================================================

-- 1. Add apply_token to jobs (public shareable apply URL)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS apply_token TEXT UNIQUE;

-- 2. Backfill tokens for existing rows
UPDATE jobs
SET apply_token = gen_random_uuid()::TEXT
WHERE apply_token IS NULL;

-- 3. Auto-generate apply_token on new jobs
CREATE OR REPLACE FUNCTION set_job_apply_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.apply_token IS NULL THEN
    NEW.apply_token := gen_random_uuid()::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_apply_token ON jobs;
CREATE TRIGGER trg_set_job_apply_token
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_apply_token();
