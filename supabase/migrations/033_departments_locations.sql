-- ============================================================
-- 033: Departments + Locations — org-scoped reference tables.
-- Both are admin-configured lookups used by openings/jobs.
-- ============================================================

-- ── departments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT,                   -- optional URL-friendly form, e.g. "engineering"
  parent_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_org     ON departments(org_id);
CREATE INDEX IF NOT EXISTS idx_departments_active  ON departments(org_id, is_active);

CREATE TRIGGER set_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_departments" ON departments FOR ALL USING (true) WITH CHECK (true);

-- ── locations ────────────────────────────────────────────────
-- Structured for posting feeds (Indeed XML, LinkedIn) + comp-band matching.
CREATE TABLE IF NOT EXISTS locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  name         TEXT NOT NULL,        -- display name, e.g. "San Francisco HQ"
  city         TEXT,
  state        TEXT,
  country      TEXT,                 -- ISO 3166-1 alpha-2, e.g. "US"
  postal_code  TEXT,
  remote_type  TEXT NOT NULL DEFAULT 'onsite'
               CHECK (remote_type IN ('onsite', 'remote', 'hybrid')),
  timezone     TEXT,                 -- IANA tz, e.g. "America/Los_Angeles"
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_locations_org         ON locations(org_id);
CREATE INDEX IF NOT EXISTS idx_locations_active      ON locations(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_locations_country     ON locations(country);

CREATE TRIGGER set_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_locations" ON locations FOR ALL USING (true) WITH CHECK (true);
