-- ============================================================
-- 067: Relax candidacy anchors (Phase 3 / C2).
--
-- A canonical-job candidacy attaches via applications.job_id (+ stage_id on a
-- canonical job stage) and never has a legacy hiring_request. Relax the
-- hiring_request_id NOT NULL on applications/interviews/offers so those records
-- can be created without one. They already carry the durable contract
-- (applications.id / application_id); job_id/opening_id already exist on
-- applications (migration 064).
--
-- Additive/reversible (no data change). Existing rows keep hiring_request_id.
-- ============================================================

ALTER TABLE applications ALTER COLUMN hiring_request_id DROP NOT NULL;
ALTER TABLE interviews   ALTER COLUMN hiring_request_id DROP NOT NULL;
ALTER TABLE offers       ALTER COLUMN hiring_request_id DROP NOT NULL;

-- The legacy unique (candidate_id, hiring_request_id) still guards legacy dupes;
-- canonical dedupe is enforced in the create path by (candidate_id, job_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_candidate_job
  ON applications(candidate_id, job_id)
  WHERE job_id IS NOT NULL;
