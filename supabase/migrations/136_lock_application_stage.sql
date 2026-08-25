-- 136_lock_application_stage.sql
--
-- FINAL hardening for "every application always has a stage." This is the DB-level
-- guarantee that makes an unstaged candidate impossible at every layer.
--
-- ⚠️ APPLY LAST — ONLY AFTER these are deployed to production:
--   • recruiterstack-api (Django) PR: stage-delete reassigns candidates, and the
--     stage-move PATCH rejects a blank/invalid stage (no more update(stage_id=None)).
--   • recruiterstack (Next.js): deleteStage reassigns candidates.
--   • migration 135 (backfill) has been applied.
-- If applied while the old Django blanking code is still live, that code will start
-- raising IntegrityError (it tries to write stage_id = NULL). Deploy code first.
--
-- Two changes:
--   1. FK ON DELETE SET NULL → RESTRICT: the database refuses to delete a
--      pipeline_stage that still has applications (the app code now reassigns them
--      first, so a normal delete succeeds; a stray delete fails loudly instead of
--      silently orphaning candidates).
--   2. stage_id NOT NULL: an application can never again be saved without a stage.

-- ── Safety net: re-run the 135 backfill so a late NULL/orphan can't block NOT NULL.
UPDATE applications a
SET stage_id = sub.id
FROM (
  SELECT DISTINCT ON (s.job_id) s.job_id, s.id
  FROM pipeline_stages s
  WHERE s.job_id IS NOT NULL
  ORDER BY s.job_id,
    CASE s.zone WHEN 'application_review' THEN 0 WHEN 'active' THEN 1
                WHEN 'offer' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,
    s.order_index
) sub
WHERE a.job_id = sub.job_id
  AND (a.stage_id IS NULL OR NOT EXISTS (SELECT 1 FROM pipeline_stages p WHERE p.id = a.stage_id));

UPDATE applications a
SET stage_id = sub.id
FROM (
  SELECT DISTINCT ON (s.hiring_request_id) s.hiring_request_id, s.id
  FROM pipeline_stages s
  WHERE s.hiring_request_id IS NOT NULL
  ORDER BY s.hiring_request_id,
    CASE s.zone WHEN 'application_review' THEN 0 WHEN 'active' THEN 1
                WHEN 'offer' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,
    s.order_index
) sub
WHERE a.job_id IS NULL AND a.hiring_request_id = sub.hiring_request_id
  AND (a.stage_id IS NULL OR NOT EXISTS (SELECT 1 FROM pipeline_stages p WHERE p.id = a.stage_id));

-- ── 1. Swap the FK from SET NULL to RESTRICT ────────────────────────────────
-- The inline FK from migration 003 is auto-named applications_stage_id_fkey.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_stage_id_fkey;
ALTER TABLE applications
  ADD CONSTRAINT applications_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE RESTRICT;

-- ── 2. Make the stage mandatory ─────────────────────────────────────────────
-- Fails only if a residual NULL remains (a job with zero stages) — that surfaces a
-- genuinely broken job to fix, rather than silently allowing an unstaged candidate.
ALTER TABLE applications ALTER COLUMN stage_id SET NOT NULL;
