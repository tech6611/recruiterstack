-- 138_archived_stage.sql
--
-- Make "Archived" a real, locked pipeline stage in the Completed zone (Ashby
-- parity: Completed = Hired + Archived), and move rejected/withdrawn candidates
-- into it. A BEFORE trigger keeps them there for EVERY reject path — Django,
-- Next.js, copilot, autopilot, or raw SQL — without touching any app code.
--
-- Canonical-only (job_id): this DB has no legacy hiring_requests table.
-- Additive + idempotent (safe to re-run). Rejected/withdrawn candidacies keep a
-- valid stage, so the migration-136 invariant (stage_id NOT NULL + FK RESTRICT)
-- stays satisfied.

-- ── 1. New jobs: seed an Archived stage alongside Hired ─────────────────────
CREATE OR REPLACE FUNCTION create_default_job_pipeline_stages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pipeline_stages (job_id, org_id, name, order_index, color, zone, is_promotion_gate) VALUES
    (NEW.id, NEW.org_id, 'New lead',     -3, 'slate',   'lead',               false),
    (NEW.id, NEW.org_id, 'Reached out',  -2, 'blue',    'lead',               false),
    (NEW.id, NEW.org_id, 'Replied',      -1, 'violet',  'lead',               true),
    (NEW.id, NEW.org_id, 'Applied',       0, 'slate',   'application_review', false),
    (NEW.id, NEW.org_id, 'Screening',     1, 'blue',    'active',             false),
    (NEW.id, NEW.org_id, 'Phone Screen',  2, 'violet',  'active',             false),
    (NEW.id, NEW.org_id, 'Interview',     3, 'amber',   'active',             false),
    (NEW.id, NEW.org_id, 'Offer',         4, 'emerald', 'offer',              false),
    (NEW.id, NEW.org_id, 'Hired',         5, 'green',   'completed',          false),
    -- Terminal: archived / rejected outcome (locked, like Hired).
    (NEW.id, NEW.org_id, 'Archived',      6, 'slate',   'completed',          false);
  RETURN NEW;
END;
$$;

-- ── 2. Existing jobs: add an Archived stage where missing ───────────────────
INSERT INTO pipeline_stages (job_id, org_id, name, order_index, color, zone, is_promotion_gate)
SELECT j.id, j.org_id, 'Archived',
       COALESCE((SELECT max(p2.order_index) FROM pipeline_stages p2 WHERE p2.job_id = j.id), 5) + 1,
       'slate', 'completed', false
FROM jobs j
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages p WHERE p.job_id = j.id AND p.name = 'Archived');

-- ── 3. Move existing rejected/withdrawn candidacies onto the Archived stage ──
UPDATE applications a
SET stage_id = sub.id
FROM (
  SELECT DISTINCT ON (s.job_id) s.job_id, s.id
  FROM pipeline_stages s WHERE s.name = 'Archived' AND s.job_id IS NOT NULL
  ORDER BY s.job_id, s.id
) sub
WHERE a.status IN ('rejected', 'withdrawn') AND a.job_id = sub.job_id
  AND a.stage_id IS DISTINCT FROM sub.id;

-- ── 4. Trigger: any reject/withdraw moves the candidacy to Archived ─────────
CREATE OR REPLACE FUNCTION archive_stage_on_reject()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  archived_id uuid;
BEGIN
  IF NEW.status IN ('rejected', 'withdrawn')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.job_id IS NOT NULL THEN
    SELECT s.id INTO archived_id
    FROM pipeline_stages s
    WHERE s.name = 'Archived' AND s.job_id = NEW.job_id
    LIMIT 1;
    IF archived_id IS NOT NULL THEN
      NEW.stage_id := archived_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_stage_on_reject ON applications;
CREATE TRIGGER trg_archive_stage_on_reject
  BEFORE INSERT OR UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION archive_stage_on_reject();
