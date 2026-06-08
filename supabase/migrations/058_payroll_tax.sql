-- ============================================================
-- 058: Payroll v1 — country tax engine + per-employee declarations.
--
-- v0 was a payslip ledger; v1 adds compute. We don't compete with Symmetry
-- or Razorpay on math; we ship a pluggable tax-engine interface and one
-- concrete engine (India, FY 2026-27, both regimes). Future country
-- engines plug into the same interface — no schema rewrite.
--
-- Three tables:
--   payroll_org_settings — org-level tax preferences (country, state,
--                          default regime, basic-pct, PF/ESI/PT rules).
--                          Read at compute time by the engine.
--   employee_profiles.tax_regime — per-employee 'new' | 'old' override of
--                          the org default. Stable across pay periods.
--   employee_tax_declarations — per (employee, FY) old-regime declarations
--                          (rent, 80C, 80D, 80CCD(1B)). Ignored under new
--                          regime. Annual record.
--
-- All values in INR for v1. When we add a non-India engine, that engine
-- reads its own currency from compensation_records.currency and from
-- the run's currency.
-- ============================================================

-- ── payroll_org_settings ─────────────────────────────────────
-- One row per org. Created lazily on first read.
CREATE TABLE IF NOT EXISTS payroll_org_settings (
  org_id                   TEXT PRIMARY KEY,
  country_code             TEXT NOT NULL DEFAULT 'IN'
                           CHECK (country_code IN ('IN')),    -- expand as engines land
  default_state            TEXT NOT NULL DEFAULT 'KA',         -- ISO-3166-2 subdivision code (KA, MH, TN, DL, …)
  default_tax_regime       TEXT NOT NULL DEFAULT 'new'
                           CHECK (default_tax_regime IN ('new','old')),
  metro                    BOOLEAN NOT NULL DEFAULT true,      -- affects HRA exemption % under old regime
  -- Pay decomposition. We compute Basic/HRA/Special from base_salary at
  -- run time using these percentages; no need to store the split per row.
  basic_pct                NUMERIC(5,4) NOT NULL DEFAULT 0.5000 CHECK (basic_pct BETWEEN 0.1 AND 1),
  hra_pct_metro            NUMERIC(5,4) NOT NULL DEFAULT 0.5000 CHECK (hra_pct_metro BETWEEN 0 AND 1),
  hra_pct_non_metro        NUMERIC(5,4) NOT NULL DEFAULT 0.4000 CHECK (hra_pct_non_metro BETWEEN 0 AND 1),
  -- PF (Employees' Provident Fund). Wage ceiling stays ₹15,000 per Budget 2026;
  -- many private companies don't apply the cap (full Basic, both sides), so
  -- it's a toggle. Default OFF (full Basic) to match common SME behaviour.
  pf_employee_pct          NUMERIC(5,4) NOT NULL DEFAULT 0.1200 CHECK (pf_employee_pct BETWEEN 0 AND 0.25),
  pf_wage_ceiling_enabled  BOOLEAN NOT NULL DEFAULT false,
  pf_wage_ceiling          NUMERIC(12,2) NOT NULL DEFAULT 15000.00,
  -- ESI applies only if monthly gross ≤ threshold (₹21k since 2017).
  esi_threshold            NUMERIC(12,2) NOT NULL DEFAULT 21000.00,
  esi_employee_pct         NUMERIC(5,4) NOT NULL DEFAULT 0.0075 CHECK (esi_employee_pct BETWEEN 0 AND 0.05),
  -- Free-text notes shown on the settings page (e.g. "exempt EPS for OCI staff").
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_payroll_org_settings_updated_at
  BEFORE UPDATE ON payroll_org_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE payroll_org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_payroll_org_settings"
  ON payroll_org_settings FOR ALL USING (true) WITH CHECK (true);

-- ── employee_profiles.tax_regime ─────────────────────────────
-- Per-employee regime preference. Default 'new' matches the regime the
-- govt sets as default since FY 2023-24. Old-regime users must also fill
-- employee_tax_declarations for any exemptions to apply.
ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS tax_regime TEXT NOT NULL DEFAULT 'new'
  CHECK (tax_regime IN ('new','old'));

-- ── employee_tax_declarations ────────────────────────────────
-- One row per (employee, financial year). Only consulted under old regime.
-- FY is free-text 'YYYY-YY' so it survives any tax-year convention change
-- (FY 2026-27 → '2026-27'). Empty / missing declaration = no exemption.
CREATE TABLE IF NOT EXISTS employee_tax_declarations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   TEXT NOT NULL,
  employee_id              UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  fy                       TEXT NOT NULL,                     -- e.g. '2026-27'
  -- Old-regime exemption inputs. All annual amounts.
  rent_paid_annual         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rent_paid_annual >= 0),
  section_80c              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (section_80c       >= 0),
  section_80d              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (section_80d       >= 0),
  section_80ccd_1b         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (section_80ccd_1b  >= 0),
  -- Free-form extras for niche exemptions (80E education loan, 80G donations,
  -- 80TTA interest, …). Engine reads the keys it recognises and ignores the rest.
  other_exemptions         JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_employee_tax_declarations_fy
  ON employee_tax_declarations(employee_id, fy);

CREATE INDEX IF NOT EXISTS idx_employee_tax_declarations_org_fy
  ON employee_tax_declarations(org_id, fy);

CREATE TRIGGER set_employee_tax_declarations_updated_at
  BEFORE UPDATE ON employee_tax_declarations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE employee_tax_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_employee_tax_declarations"
  ON employee_tax_declarations FOR ALL USING (true) WITH CHECK (true);
