-- 135_backfill_application_stage.sql
--
-- Repair step for the invariant "every application always has a stage."
--
-- Assigns a real stage to any application that currently has NO usable stage —
-- either stage_id IS NULL (stranded in the board's "Unstaged" column) or stage_id
-- points at a pipeline_stage that no longer exists (orphaned; these candidates had
-- vanished from the board entirely). Each such application is moved to its job's
-- first sensible stage: prefer the Application Review stage ("Applied"), then the
-- first Active stage, then the earliest by order_index (a Lead stage only if the
-- job has nothing else).
--
-- Covers both canonical (job_id) and legacy (hiring_request_id) applications.
-- Idempotent and safe to run anytime — it only touches rows that lack a valid
-- stage. Does NOT change the schema (that is the separate, apply-last 136).

-- Preferred first stage per job_id (canonical).
UPDATE applications a
SET stage_id = sub.id
FROM (
  SELECT DISTINCT ON (s.job_id) s.job_id, s.id
  FROM pipeline_stages s
  WHERE s.job_id IS NOT NULL
  ORDER BY s.job_id,
    CASE s.zone
      WHEN 'application_review' THEN 0
      WHEN 'active'             THEN 1
      WHEN 'offer'              THEN 2
      WHEN 'completed'          THEN 3
      ELSE 4  -- lead / unknown last
    END,
    s.order_index
) sub
WHERE a.job_id = sub.job_id
  AND (
    a.stage_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM pipeline_stages p WHERE p.id = a.stage_id)
  );

-- Preferred first stage per hiring_request_id (legacy applications, no job_id).
UPDATE applications a
SET stage_id = sub.id
FROM (
  SELECT DISTINCT ON (s.hiring_request_id) s.hiring_request_id, s.id
  FROM pipeline_stages s
  WHERE s.hiring_request_id IS NOT NULL
  ORDER BY s.hiring_request_id,
    CASE s.zone
      WHEN 'application_review' THEN 0
      WHEN 'active'             THEN 1
      WHEN 'offer'              THEN 2
      WHEN 'completed'          THEN 3
      ELSE 4
    END,
    s.order_index
) sub
WHERE a.job_id IS NULL
  AND a.hiring_request_id = sub.hiring_request_id
  AND (
    a.stage_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM pipeline_stages p WHERE p.id = a.stage_id)
  );
