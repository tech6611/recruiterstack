-- ============================================================
-- 070: Only mint the public apply token once a job is OPEN.
--
-- Migration 068 auto-generated jobs.apply_token on INSERT for every job,
-- regardless of status — so a draft/pending_approval/approved job already had
-- a shareable apply URL even though the public apply route rejects non-open
-- jobs. That produced "dead" links that look valid but accept no applicants.
--
-- This migration defers token creation: a token is minted only when the job
-- reaches status = 'open' (on INSERT or UPDATE), and pre-open jobs have NULL.
-- Once minted the token is kept (a later close/re-open reuses the same URL).
--
-- Status ladder: draft → pending_approval → approved → open → closed/archived.
--
-- Additive/reversible & idempotent: re-runnable; rollback = restore the
-- migration-068 trigger.
-- ============================================================

-- 1. Mint the token only when the job is open. Fires on INSERT and UPDATE so a
--    job that transitions draft→…→open gets its token at the moment it opens.
CREATE OR REPLACE FUNCTION set_job_apply_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'open' AND NEW.apply_token IS NULL THEN
    NEW.apply_token := gen_random_uuid()::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_apply_token ON jobs;
CREATE TRIGGER trg_set_job_apply_token
  BEFORE INSERT OR UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_apply_token();

-- 2. Revoke tokens that 068 minted for jobs not yet open. These links never
--    worked (the apply route gates on status = 'open'); this stops them from
--    being copyable/exposed.
UPDATE jobs
SET apply_token = NULL
WHERE status IN ('draft', 'pending_approval', 'approved')
  AND apply_token IS NOT NULL;

-- 3. Guarantee every already-open job has a token (covers any open row that
--    somehow lacks one).
UPDATE jobs
SET apply_token = gen_random_uuid()::TEXT
WHERE status = 'open'
  AND apply_token IS NULL;
