-- ============================================================
-- 133: Restore applications.review_status on any DB that missed migration 030
--
-- The pipeline automation engine, the ICP learning signals, and the candidate
-- triage buttons (Yes/No/Maybe) all read/write applications.review_status by
-- name. On a database where migration 030 never ran, that column is absent, so
-- those explicit-column queries hard-error (PostgREST: "column
-- applications.review_status does not exist") — silently returning zero rows and
-- disabling the automation engine. This re-adds it, idempotently. No-op where
-- 030 already applied.
-- ============================================================

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed'
  CHECK (review_status IN ('unreviewed', 'reviewed', 'yes', 'no', 'maybe'));

CREATE INDEX IF NOT EXISTS idx_applications_review_status
  ON applications (org_id, review_status)
  WHERE review_status = 'unreviewed';
