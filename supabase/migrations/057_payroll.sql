-- ============================================================
-- 057: Payroll v0 — payslip ledger.
--
-- Honest v0 scope: store what each employee was paid in each pay period.
-- We do NOT compute payroll here (no tax engine, no statutory rules, no
-- bank disbursement). The org runs payroll wherever they already run it
-- (Razorpay, Keka, in-house spreadsheets); we hold the resulting ledger so
-- the unified person → application → comp → payslip story is real.
--
-- Two tables:
--   payroll_runs — one row per (org, pay period). Status: draft → finalized.
--   payslips     — one row per (run, employee). Gross + deductions jsonb + net.
--
-- Totals on payroll_runs are computed on read (sum of payslip nets/grosses) —
-- same pattern as leave balances and OKR progress. No aggregate cache.
--
-- Once finalized, a run is treated as immutable in the UI/API; the DB doesn't
-- enforce that yet (would lock us in too early). v1 can compute gross→net
-- inside this same schema additively — payslips already has the breakdown
-- column shape to carry computed line items.
-- ============================================================

-- ── payroll_runs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  pay_date          DATE,                                   -- when employees actually receive funds (optional)
  currency          TEXT NOT NULL DEFAULT 'INR',
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','finalized')),
  notes             TEXT,
  finalized_at      TIMESTAMPTZ,
  finalized_by      TEXT,                                   -- clerk user id (free-text; we don't FK to users here)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org_period
  ON payroll_runs(org_id, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org_status
  ON payroll_runs(org_id, status, period_end DESC);

-- Guard against duplicate runs for the same exact period.
-- (Different period spans inside the same month are fine — orgs occasionally
-- do off-cycle bonus runs.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payroll_runs_org_span
  ON payroll_runs(org_id, period_start, period_end);

CREATE TRIGGER set_payroll_runs_updated_at
  BEFORE UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_payroll_runs"
  ON payroll_runs FOR ALL USING (true) WITH CHECK (true);

-- ── payslips ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payslips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  run_id            UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE RESTRICT,
  -- Snapshot of the employee's display name + email at payslip time so old
  -- payslips remain readable even if the employee record is later corrected
  -- (this is a ledger; ledgers don't mutate retroactively).
  employee_name_snapshot   TEXT,
  employee_email_snapshot  TEXT,
  -- Money fields use NUMERIC(14,2) — same shape as compensation_records.
  gross             NUMERIC(14,2) NOT NULL DEFAULT 0
                    CHECK (gross >= 0),
  deductions_total  NUMERIC(14,2) NOT NULL DEFAULT 0
                    CHECK (deductions_total >= 0),
  net               NUMERIC(14,2) NOT NULL DEFAULT 0
                    CHECK (net >= 0),
  -- Freeform breakdown so this works in any country without us baking statutory
  -- rules. Suggested shape: { earnings: [{label, amount}], deductions: [{label, amount}] }
  -- v1 can switch to a typed payslip_lines table additively.
  breakdown         JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One payslip per (run, employee).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payslips_run_employee
  ON payslips(run_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_payslips_employee_recent
  ON payslips(employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payslips_org_recent
  ON payslips(org_id, created_at DESC);

CREATE TRIGGER set_payslips_updated_at
  BEFORE UPDATE ON payslips
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_payslips"
  ON payslips FOR ALL USING (true) WITH CHECK (true);
