-- ============================================================
-- 055: HRIS — leave policies + holiday calendar.
--
-- v1: annual-grant model (not monthly accrual). Each org sets annual_days per
-- leave_type; an employee's "available" balance is computed at read time as
-- annual_days minus the sum of approved+pending request days for the current
-- calendar year. No balances table — single source of truth is time_off_requests
-- + this policies table.
--
-- Holiday calendars are stored per org (optionally per country code), surfaced
-- on /me/time-off for context. v1 doesn't subtract holidays from request
-- day-counts; that's a deferred sophistication for jurisdictions that require it.
--
-- Seed step: every org with at least one employee_profile gets default
-- policies (vacation 15, sick 10, personal 5, unpaid 0). Idempotent.
-- ============================================================

-- ── leave_policies ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  leave_type    TEXT NOT NULL
                CHECK (leave_type IN ('vacation', 'sick', 'personal', 'unpaid')),
  annual_days   INTEGER NOT NULL DEFAULT 0
                CHECK (annual_days >= 0),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_policies_org_type
  ON leave_policies(org_id, leave_type);

CREATE TRIGGER set_leave_policies_updated_at
  BEFORE UPDATE ON leave_policies
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_leave_policies"
  ON leave_policies FOR ALL USING (true) WITH CHECK (true);

-- ── holidays ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holidays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  date          DATE NOT NULL,
  name          TEXT NOT NULL,
  country       TEXT,                        -- ISO 3166 alpha-2; null = applies to all
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_org_date ON holidays(org_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_org_date_name
  ON holidays(org_id, date, name);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_holidays"
  ON holidays FOR ALL USING (true) WITH CHECK (true);

-- ── seed: default policies per org ───────────────────────────
-- Inserts a default policy row for every (org, leave_type) pair that doesn't
-- have one yet. Defaults: vacation 15, sick 10, personal 5, unpaid 0.
INSERT INTO leave_policies (org_id, leave_type, annual_days, description, is_active)
SELECT t.org_id, t.leave_type, t.annual_days,
       'Default policy — edit to match your handbook.', true
FROM (
  SELECT DISTINCT ep.org_id, v.leave_type, v.annual_days
  FROM employee_profiles ep
  CROSS JOIN (VALUES
    ('vacation', 15),
    ('sick',     10),
    ('personal',  5),
    ('unpaid',    0)
  ) AS v(leave_type, annual_days)
) t
WHERE NOT EXISTS (
  SELECT 1 FROM leave_policies lp
  WHERE lp.org_id = t.org_id AND lp.leave_type = t.leave_type
);
