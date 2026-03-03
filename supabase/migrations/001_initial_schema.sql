-- RecruiterStack Phase 1: Foundation Schema
-- Safe to re-run: drops and recreates everything cleanly

-- ============================================================
-- CLEAN SLATE (drop in reverse dependency order)
-- ============================================================

DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TYPE  IF EXISTS candidate_status CASCADE;
DROP TYPE  IF EXISTS role_status CASCADE;
DROP FUNCTION IF EXISTS trigger_set_updated_at CASCADE;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE candidate_status AS ENUM (
  'active',
  'inactive',
  'interviewing',
  'offer_extended',
  'hired',
  'rejected'
);

CREATE TYPE role_status AS ENUM (
  'draft',
  'active',
  'paused',
  'closed'
);

-- ============================================================
-- CANDIDATES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS candidates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  resume_url    TEXT,
  skills        TEXT[] NOT NULL DEFAULT '{}',
  experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  current_title TEXT,
  location      TEXT,
  status        candidate_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by status and skills
CREATE INDEX idx_candidates_status   ON candidates(status);
CREATE INDEX idx_candidates_skills   ON candidates USING GIN(skills);
CREATE INDEX idx_candidates_email    ON candidates(email);
CREATE INDEX idx_candidates_location ON candidates(location);

-- ============================================================
-- ROLES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_title        TEXT NOT NULL,
  required_skills  TEXT[] NOT NULL DEFAULT '{}',
  min_experience   INTEGER NOT NULL DEFAULT 0 CHECK (min_experience >= 0),
  location         TEXT,
  salary_min       INTEGER CHECK (salary_min >= 0),
  salary_max       INTEGER CHECK (salary_max >= 0),
  status           role_status NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT salary_range_valid CHECK (
    salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max
  )
);

CREATE INDEX idx_roles_status         ON roles(status);
CREATE INDEX idx_roles_required_skills ON roles USING GIN(required_skills);
CREATE INDEX idx_roles_location       ON roles(location);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-updates updated_at on every row change)
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (enable but keep permissive for Phase 1)
-- ============================================================

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS; anon key gets read-only for now
CREATE POLICY "Allow service role full access on candidates"
  ON candidates FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access on roles"
  ON roles FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- SEED DATA (optional — useful for local dev)
-- ============================================================

INSERT INTO roles (job_title, required_skills, min_experience, location, salary_min, salary_max, status) VALUES
  ('Senior Full-Stack Engineer',   ARRAY['TypeScript','React','Node.js','PostgreSQL'], 5, 'Remote',        140000, 180000, 'active'),
  ('ML Engineer',                  ARRAY['Python','PyTorch','MLflow','SQL'],           3, 'San Francisco', 160000, 200000, 'active'),
  ('Product Manager',              ARRAY['Roadmapping','Agile','SQL','Figma'],         4, 'New York',      120000, 160000, 'active'),
  ('DevOps / Platform Engineer',   ARRAY['Kubernetes','Terraform','AWS','Docker'],     4, 'Remote',        130000, 170000, 'draft'),
  ('Recruiting Coordinator',       ARRAY['ATS','Coordination','Communication'],        1, 'Austin',         60000,  80000, 'paused');

INSERT INTO candidates (name, email, phone, skills, experience_years, current_title, location, status) VALUES
  ('Alex Rivera',    'alex.rivera@example.com',  '+1-555-0101', ARRAY['TypeScript','React','Node.js','AWS'],         6, 'Senior Software Engineer',  'Remote',        'active'),
  ('Jordan Lee',     'jordan.lee@example.com',   '+1-555-0102', ARRAY['Python','PyTorch','TensorFlow','SQL'],        4, 'ML Engineer',               'San Francisco', 'active'),
  ('Morgan Chen',    'morgan.chen@example.com',  '+1-555-0103', ARRAY['Roadmapping','Agile','SQL','Figma'],          5, 'Senior PM',                 'New York',      'interviewing'),
  ('Sam Patel',      'sam.patel@example.com',    '+1-555-0104', ARRAY['Kubernetes','Terraform','AWS','CI/CD'],       7, 'Platform Engineer',         'Austin',        'active'),
  ('Taylor Kim',     'taylor.kim@example.com',   '+1-555-0105', ARRAY['React','TypeScript','GraphQL','CSS'],         3, 'Frontend Developer',        'Remote',        'active'),
  ('Casey Brown',    'casey.brown@example.com',  '+1-555-0106', ARRAY['Python','Django','PostgreSQL','Docker'],      2, 'Backend Developer',         'Chicago',       'inactive'),
  ('Jamie Wilson',   'jamie.wilson@example.com', '+1-555-0107', ARRAY['Go','Kubernetes','Prometheus','Grafana'],     8, 'Staff Engineer',            'Seattle',       'offer_extended'),
  ('Riley Martinez', 'riley.m@example.com',      '+1-555-0108', ARRAY['Data Analysis','SQL','Tableau','Python'],    3, 'Data Analyst',              'Remote',        'active');
