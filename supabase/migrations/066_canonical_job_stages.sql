-- ============================================================
-- 066: Canonical job pipeline stages (Phase 3 / C1).
--
-- Generalize `pipeline_stages` to belong to EITHER a legacy `hiring_request`
-- OR a canonical `job`. Add `job_id`, relax `hiring_request_id` to nullable,
-- enforce exactly-one parent via CHECK. Seed the 6 default stages on `jobs`
-- insert (mirrors the legacy create_default_pipeline_stages trigger), stamping
-- the job's org_id. `applications.stage_id` already references pipeline_stages,
-- so canonical candidacies move through these the same way.
--
-- Additive/reversible: existing rows (all hiring_request_id-anchored) satisfy
-- the CHECK unchanged. Rollback = drop job_id + trigger + restore NOT NULL.
-- ============================================================

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE pipeline_stages
  ALTER COLUMN hiring_request_id DROP NOT NULL;

-- Exactly one parent: a legacy hiring_request XOR a canonical job.
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_one_parent;
ALTER TABLE pipeline_stages
  ADD CONSTRAINT pipeline_stages_one_parent
  CHECK ((hiring_request_id IS NOT NULL) <> (job_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_job_canonical
  ON pipeline_stages(job_id, order_index);

-- Default stages when a canonical job is created.
CREATE OR REPLACE FUNCTION create_default_job_pipeline_stages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pipeline_stages (job_id, org_id, name, order_index, color) VALUES
    (NEW.id, NEW.org_id, 'Applied',      0, 'slate'),
    (NEW.id, NEW.org_id, 'Screening',    1, 'blue'),
    (NEW.id, NEW.org_id, 'Phone Screen', 2, 'violet'),
    (NEW.id, NEW.org_id, 'Interview',    3, 'amber'),
    (NEW.id, NEW.org_id, 'Offer',        4, 'emerald'),
    (NEW.id, NEW.org_id, 'Hired',        5, 'green');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_job_pipeline_stages ON jobs;
CREATE TRIGGER trg_create_default_job_pipeline_stages
  AFTER INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION create_default_job_pipeline_stages();
