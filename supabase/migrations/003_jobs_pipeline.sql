-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 003: Jobs pipeline — stages, applications, events
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. pipeline_stages: custom stages per hiring_request (job)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hiring_request_id  UUID        NOT NULL REFERENCES hiring_requests(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  order_index        INTEGER     NOT NULL DEFAULT 0,
  color              TEXT        NOT NULL DEFAULT 'slate', -- slate|blue|violet|amber|emerald|green|red|pink
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. applications: a candidate in a job's pipeline
CREATE TABLE IF NOT EXISTS applications (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  hiring_request_id  UUID        NOT NULL REFERENCES hiring_requests(id) ON DELETE CASCADE,
  stage_id           UUID        REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  status             TEXT        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','rejected','withdrawn','hired')),
  source             TEXT        NOT NULL DEFAULT 'manual',  -- manual|applied|imported|sourced|referral
  source_detail      TEXT,                                   -- e.g. "LinkedIn", "Referral: Jane"
  resume_url         TEXT,
  cover_letter       TEXT,
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(candidate_id, hiring_request_id)
);

-- 3. application_events: activity timeline per application
CREATE TABLE IF NOT EXISTS application_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,  -- applied|stage_moved|note_added|status_changed|email_sent
  from_stage      TEXT,
  to_stage        TEXT,
  note            TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_by      TEXT        NOT NULL DEFAULT 'Recruiter',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Add apply_link_token to hiring_requests (public shareable apply URL)
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS apply_link_token TEXT UNIQUE;

-- Backfill tokens for existing rows
UPDATE hiring_requests
SET apply_link_token = gen_random_uuid()::TEXT
WHERE apply_link_token IS NULL;

-- 5. Auto-generate apply_link_token on new hiring_requests
CREATE OR REPLACE FUNCTION set_apply_link_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.apply_link_token IS NULL THEN
    NEW.apply_link_token := gen_random_uuid()::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_apply_link_token ON hiring_requests;
CREATE TRIGGER trg_set_apply_link_token
  BEFORE INSERT ON hiring_requests
  FOR EACH ROW EXECUTE FUNCTION set_apply_link_token();

-- 6. Auto-create default pipeline stages when a hiring_request is inserted
CREATE OR REPLACE FUNCTION create_default_pipeline_stages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pipeline_stages (hiring_request_id, name, order_index, color) VALUES
    (NEW.id, 'Applied',      0, 'slate'),
    (NEW.id, 'Screening',    1, 'blue'),
    (NEW.id, 'Phone Screen', 2, 'violet'),
    (NEW.id, 'Interview',    3, 'amber'),
    (NEW.id, 'Offer',        4, 'emerald'),
    (NEW.id, 'Hired',        5, 'green');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_pipeline_stages ON hiring_requests;
CREATE TRIGGER trg_create_default_pipeline_stages
  AFTER INSERT ON hiring_requests
  FOR EACH ROW EXECUTE FUNCTION create_default_pipeline_stages();

-- 7. Backfill default stages for existing hiring_requests
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM hiring_requests LOOP
    IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE hiring_request_id = r.id) THEN
      INSERT INTO pipeline_stages (hiring_request_id, name, order_index, color) VALUES
        (r.id, 'Applied',      0, 'slate'),
        (r.id, 'Screening',    1, 'blue'),
        (r.id, 'Phone Screen', 2, 'violet'),
        (r.id, 'Interview',    3, 'amber'),
        (r.id, 'Offer',        4, 'emerald'),
        (r.id, 'Hired',        5, 'green');
    END IF;
  END LOOP;
END;
$$;

-- 8. RLS (service role bypasses; anon/public access handled per-route)
ALTER TABLE pipeline_stages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_stages"  ON pipeline_stages    FOR ALL USING (true);
CREATE POLICY "service_role_all_apps"    ON applications       FOR ALL USING (true);
CREATE POLICY "service_role_all_events"  ON application_events FOR ALL USING (true);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_job    ON pipeline_stages(hiring_request_id, order_index);
CREATE INDEX IF NOT EXISTS idx_applications_job       ON applications(hiring_request_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_stage     ON applications(stage_id);
CREATE INDEX IF NOT EXISTS idx_app_events_app         ON application_events(application_id, created_at DESC);
