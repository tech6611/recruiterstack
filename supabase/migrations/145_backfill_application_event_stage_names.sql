-- 145: heal application_events rows that stored stage UUIDs instead of names.
--
-- Every writer stores pipeline-stage NAMES in from_stage/to_stage (the activity
-- feed renders these verbatim). The stage-automation engine wrote raw stage ids
-- until 2026-09-17, so "Moved to 72774910-c06c-…" showed up in candidate feeds.
-- The engine now writes names and every read path resolves stray ids on the fly;
-- this fixes the stored rows so the data is right at rest too.
--
-- Safe + idempotent: only touches values that exactly match a pipeline_stages id
-- in the same org. Re-running is a no-op.

UPDATE application_events e
SET    from_stage = s.name
FROM   pipeline_stages s
WHERE  e.from_stage ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND  s.id = e.from_stage::uuid
  AND  s.org_id = e.org_id;

UPDATE application_events e
SET    to_stage = s.name
FROM   pipeline_stages s
WHERE  e.to_stage ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND  s.id = e.to_stage::uuid
  AND  s.org_id = e.org_id;
