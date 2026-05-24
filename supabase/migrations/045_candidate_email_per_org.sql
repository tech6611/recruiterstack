-- ============================================================
-- 045: Candidate email uniqueness — global → per-org.
-- Migration 001 created `candidates.email` as GLOBALLY unique; 007 added
-- org_id but never rescoped the constraint. That blocks two orgs from ever
-- holding the same candidate email (a multi-tenancy bug) and blocks the
-- canonical `people` model, which must be unique per org by email.
--
-- This drops whatever single-column unique constraint exists on
-- candidates(email) and replaces it with UNIQUE(org_id, email).
--
-- PRE-FLIGHT: run the duplicate detection query before applying. If any
-- (org_id, email) pair has count > 1, the ADD CONSTRAINT below will fail
-- loudly — resolve duplicates first (this migration does not auto-merge):
--   SELECT org_id, email, count(*) FROM candidates
--   GROUP BY org_id, email HAVING count(*) > 1;
-- ============================================================

-- Drop the existing single-column unique constraint on email, whatever it's
-- named (inline UNIQUE in 001 yields `candidates_email_key`, but resolve by
-- introspection to be safe).
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_class rel       ON rel.oid = con.conrelid
  JOIN pg_attribute att   ON att.attrelid = con.conrelid
                          AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'candidates'
    AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND att.attname = 'email';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE candidates DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- Per-org uniqueness. Fails loudly if cross-org-free duplicates exist.
ALTER TABLE candidates
  ADD CONSTRAINT candidates_org_email_key UNIQUE (org_id, email);

-- Keep the plain lookup index from 001 (idx_candidates_email) — it is not
-- unique and is still useful for email searches.
