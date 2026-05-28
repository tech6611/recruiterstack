-- ============================================================
-- 051: HRIS depth — time_off_requests + 4 new timeline event types.
--
-- Minimal viable: a request has its own lightweight pending→approved/rejected/
-- cancelled status (not routed through the formal approvals engine — time-off
-- is too high-volume / lower-stakes to require a configured approval chain).
-- The approver is auto-resolved at create time to the requester's MANAGER via
-- the users↔employee_profiles bridge from 050. The status lifecycle auto-writes
-- timeline events onto the existing employee_events spine.
--
-- Out of scope for this slice (deliberately): balances, accruals, calendars.
-- Those vary heavily by jurisdiction and shouldn't anchor v1 of the feature.
-- ============================================================

-- ── extend employee_events.event_type CHECK with the 4 time_off_* types ──
ALTER TABLE employee_events DROP CONSTRAINT IF EXISTS employee_events_event_type_check;
ALTER TABLE employee_events ADD CONSTRAINT employee_events_event_type_check
  CHECK (event_type IN (
    'hired', 'joined', 'manager_changed', 'terminated', 'note', 'comp_changed',
    'time_off_requested', 'time_off_approved', 'time_off_rejected', 'time_off_cancelled'
  ));

-- ── time_off_requests ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_off_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  employee_id      UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  request_type     TEXT NOT NULL
                   CHECK (request_type IN ('vacation', 'sick', 'personal', 'unpaid')),
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  hours_total      NUMERIC(8, 2),                   -- optional; UI/agent may compute
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  decided_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_note     TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_time_off_requests_employee
  ON time_off_requests(employee_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_org_status
  ON time_off_requests(org_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_approver
  ON time_off_requests(approver_user_id, status)
  WHERE approver_user_id IS NOT NULL AND status = 'pending';

CREATE TRIGGER set_time_off_requests_updated_at
  BEFORE UPDATE ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_time_off_requests"
  ON time_off_requests FOR ALL USING (true) WITH CHECK (true);

-- ── timeline triggers: request + status transitions ──────────
CREATE OR REPLACE FUNCTION log_time_off_requested_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
  VALUES (
    NEW.org_id, NEW.employee_id, 'time_off_requested',
    jsonb_build_object(
      'request_id',   NEW.id,
      'request_type', NEW.request_type,
      'start_date',   NEW.start_date,
      'end_date',     NEW.end_date,
      'hours_total',  NEW.hours_total,
      'reason',       NEW.reason
    ),
    NEW.requested_at,
    'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_time_off_requested_event
  AFTER INSERT ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION log_time_off_requested_event();

CREATE OR REPLACE FUNCTION log_time_off_status_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_event_type := CASE NEW.status
    WHEN 'approved'  THEN 'time_off_approved'
    WHEN 'rejected'  THEN 'time_off_rejected'
    WHEN 'cancelled' THEN 'time_off_cancelled'
    ELSE NULL
  END;

  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
  VALUES (
    NEW.org_id, NEW.employee_id, v_event_type,
    jsonb_build_object(
      'request_id',   NEW.id,
      'request_type', NEW.request_type,
      'start_date',   NEW.start_date,
      'end_date',     NEW.end_date,
      'decided_note', NEW.decided_note
    ),
    COALESCE(NEW.decided_at, now()),
    'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_time_off_status_event
  AFTER UPDATE OF status ON time_off_requests
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION log_time_off_status_event();
