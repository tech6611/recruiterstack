-- ============================================================
-- 030: Status enhancements
--   1. Add 'active' to hiring_request status flow (after 'posted')
--   2. Add 'on_hold' to application status
--   3. Add 'on_hold' to candidate status
--   4. Add review_status column to applications (triage)
-- ============================================================

-- 1. Application review triage column
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed'
  CHECK (review_status IN ('unreviewed', 'reviewed', 'yes', 'no', 'maybe'));

-- Index for filtering by review status
CREATE INDEX IF NOT EXISTS idx_applications_review_status
  ON applications (org_id, review_status)
  WHERE review_status = 'unreviewed';

-- Note: hiring_request.status, application.status, and candidate.status
-- are TEXT columns with application-level validation (Zod + TypeScript),
-- not database enums. No ALTER TYPE needed — just update the app code.
