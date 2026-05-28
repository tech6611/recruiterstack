-- ============================================================
-- 049: HRIS depth — compensation_records (immutable history) +
-- comp_changed event_type on the employee timeline.
--
-- Modeled the Workday way: comp is an immutable sequence of records — every
-- change is a new row with an effective_date. The "current" comp for an
-- employee is the latest record. Corrections are made by inserting a
-- corrective record, not by updating history. A trigger lands a comp_changed
-- event on employee_events automatically — same invariant pattern as 047/048.
-- ============================================================

-- ── extend the employee_events event_type CHECK to include comp_changed ──
ALTER TABLE employee_events DROP CONSTRAINT IF EXISTS employee_events_event_type_check;
ALTER TABLE employee_events ADD CONSTRAINT employee_events_event_type_check
  CHECK (event_type IN ('hired', 'joined', 'manager_changed', 'terminated', 'note', 'comp_changed'));

-- ── compensation_records ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS compensation_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             TEXT NOT NULL,
  employee_id        UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  effective_date     DATE NOT NULL,
  base_salary        NUMERIC(14, 2) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  pay_frequency      TEXT NOT NULL DEFAULT 'annual'
                     CHECK (pay_frequency IN ('annual', 'monthly', 'hourly')),
  bonus_amount       NUMERIC(14, 2),
  equity_notes       TEXT,
  variable_pay_notes TEXT,
  reason             TEXT,           -- 'hire' | 'promotion' | 'annual_review' | 'market_adjustment' | free text
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compensation_records_employee_effective
  ON compensation_records(employee_id, effective_date DESC, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_compensation_records_org_time
  ON compensation_records(org_id, recorded_at DESC);

ALTER TABLE compensation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_compensation_records"
  ON compensation_records FOR ALL USING (true) WITH CHECK (true);

-- ── trigger: every comp record lands a comp_changed event ────
-- The event's details JSONB carries the from/to summary so the UI / agent
-- can render the change without re-joining tables.
CREATE OR REPLACE FUNCTION log_compensation_event()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_salary NUMERIC(14, 2);
BEGIN
  SELECT base_salary INTO v_prev_salary
  FROM compensation_records
  WHERE employee_id = NEW.employee_id AND id <> NEW.id
  ORDER BY effective_date DESC, recorded_at DESC
  LIMIT 1;

  INSERT INTO employee_events (org_id, employee_id, event_type, details, occurred_at, recorded_by)
  VALUES (
    NEW.org_id,
    NEW.employee_id,
    'comp_changed',
    jsonb_build_object(
      'from_salary',    v_prev_salary,
      'to_salary',      NEW.base_salary,
      'currency',       NEW.currency,
      'pay_frequency',  NEW.pay_frequency,
      'effective_date', NEW.effective_date,
      'reason',         NEW.reason
    ),
    NEW.effective_date::timestamptz,
    COALESCE(NEW.recorded_by, 'system')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compensation_event
  AFTER INSERT ON compensation_records
  FOR EACH ROW EXECUTE FUNCTION log_compensation_event();
