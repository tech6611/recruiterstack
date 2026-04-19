-- ============================================================
-- 034: Compensation Bands
-- Admin-configured salary bands keyed by (level, dept, location).
-- Openings auto-fill min/max from the matching band; explicit
-- override sets openings.out_of_band = true.
-- ============================================================

CREATE TABLE IF NOT EXISTS compensation_bands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  name            TEXT NOT NULL,                       -- e.g. "IC4 Engineer — SF"
  level           TEXT NOT NULL,                       -- e.g. "IC4", "L5", "Senior"
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  location_id     UUID REFERENCES locations(id)   ON DELETE SET NULL,
  min_salary      NUMERIC(12, 2) NOT NULL CHECK (min_salary >= 0),
  max_salary      NUMERIC(12, 2) NOT NULL CHECK (max_salary >= 0),
  currency        TEXT NOT NULL DEFAULT 'USD',         -- ISO 4217
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comp_band_salary_range_valid CHECK (min_salary <= max_salary)
);

CREATE INDEX IF NOT EXISTS idx_comp_bands_org          ON compensation_bands(org_id);
CREATE INDEX IF NOT EXISTS idx_comp_bands_active       ON compensation_bands(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_comp_bands_match        ON compensation_bands(org_id, level, department_id, location_id)
  WHERE is_active = true;

CREATE TRIGGER set_comp_bands_updated_at
  BEFORE UPDATE ON compensation_bands
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE compensation_bands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_comp_bands" ON compensation_bands FOR ALL USING (true) WITH CHECK (true);
