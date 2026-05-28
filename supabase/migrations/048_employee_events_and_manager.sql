-- ============================================================
-- 048: HRIS depth — employee_events (audit-log spine) + manager_id (org chart).
-- First slice of HRIS depth on top of the apply→employee lifecycle. Same
-- additive/trigger-driven pattern as migration 047: the data layer enforces
-- the invariant ("every employment transition has an event") so callers can't
-- forget or bypass it.
--
-- Events become the spine that later HRIS features (comp changes, role changes,
-- transfers, time-off, etc.) attach to as event_types.
-- ============================================================

-- ── manager_id: the simplest org-chart primitive ─────────────
ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employee_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_profiles_manager ON employee_profiles(manager_id);

-- ── employee_events: the employment audit log ────────────────
CREATE TABLE IF NOT EXISTS employee_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL
              CHECK (event_type IN ('hired', 'joined', 'manager_changed', 'terminated', 'note')),
  details     JSONB,                       -- structured payload (from/to manager, note text, etc.)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by TEXT,                        -- 'system' for triggers, user/agent id for manual
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_events_employee     ON employee_events(employee_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_events_org_time     ON employee_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_events_employee_type ON employee_events(employee_id, event_type);

ALTER TABLE employee_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_employee_events" ON employee_events FOR ALL USING (true) WITH CHECK (true);

-- ── triggers: status & manager transitions auto-write events ─

-- 'hired' fires on INSERT (employee_profiles is born when a candidacy is hired).
CREATE OR REPLACE FUNCTION log_employee_hired_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
  VALUES (
    NEW.org_id,
    NEW.id,
    'hired',
    jsonb_build_object('candidate_id', NEW.candidate_id, 'application_id', NEW.application_id),
    COALESCE(NEW.hired_at, NEW.created_at),
    'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_hired_event
  AFTER INSERT ON employee_profiles
  FOR EACH ROW EXECUTE FUNCTION log_employee_hired_event();

-- Status transitions: pending→active = 'joined'; anything → terminated = 'terminated'.
CREATE OR REPLACE FUNCTION log_employee_status_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
    VALUES (
      NEW.org_id, NEW.id, 'joined',
      jsonb_build_object('start_date', NEW.start_date, 'joined_at', NEW.joined_at),
      COALESCE(NEW.joined_at, now()),
      'system'
    );
  END IF;

  IF NEW.status = 'terminated' AND OLD.status IS DISTINCT FROM 'terminated' THEN
    INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
    VALUES (
      NEW.org_id, NEW.id, 'terminated',
      jsonb_build_object('terminated_at', NEW.terminated_at),
      COALESCE(NEW.terminated_at, now()),
      'system'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_status_event
  AFTER UPDATE OF status ON employee_profiles
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION log_employee_status_event();

-- Manager changes log 'manager_changed' with from/to (both nullable).
CREATE OR REPLACE FUNCTION log_employee_manager_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
  VALUES (
    NEW.org_id, NEW.id, 'manager_changed',
    jsonb_build_object('from_manager_id', OLD.manager_id, 'to_manager_id', NEW.manager_id),
    now(),
    'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_manager_event
  AFTER UPDATE OF manager_id ON employee_profiles
  FOR EACH ROW
  WHEN (NEW.manager_id IS DISTINCT FROM OLD.manager_id)
  EXECUTE FUNCTION log_employee_manager_event();

-- ── backfill: synthesize events for everyone already in employee_profiles ─
-- The triggers above only catch transitions from now on; existing rows need
-- their 'hired' (and 'joined'/'terminated' where applicable) events seeded.
INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
SELECT
  org_id, id, 'hired',
  jsonb_build_object('candidate_id', candidate_id, 'application_id', application_id),
  COALESCE(hired_at, created_at),
  'system'
FROM employee_profiles
WHERE NOT EXISTS (
  SELECT 1 FROM employee_events ev WHERE ev.employee_id = employee_profiles.id AND ev.event_type = 'hired'
);

INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
SELECT
  org_id, id, 'joined',
  jsonb_build_object('start_date', start_date, 'joined_at', joined_at),
  COALESCE(joined_at, now()),
  'system'
FROM employee_profiles
WHERE status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM employee_events ev WHERE ev.employee_id = employee_profiles.id AND ev.event_type = 'joined'
  );

INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
SELECT
  org_id, id, 'terminated',
  jsonb_build_object('terminated_at', terminated_at),
  COALESCE(terminated_at, now()),
  'system'
FROM employee_profiles
WHERE status = 'terminated'
  AND NOT EXISTS (
    SELECT 1 FROM employee_events ev WHERE ev.employee_id = employee_profiles.id AND ev.event_type = 'terminated'
  );
