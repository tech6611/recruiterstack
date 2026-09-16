-- ============================================================
-- 143: Job setup breadth (Ashby parity, Phase 4).
--   * Compensation + location on the JOB (inherited from the requisition,
--     overridable), and per-POSTING display overrides.
--   * Postings: listed/unlisted visibility, per-posting apply link,
--     social description, location.
--   * Full job templates (fields + JD + comp + plan template + draft posting).
--   * Requisitions: backfill flag, target hire date, human-readable number.
-- ============================================================

-- ── Jobs: comp + location ─────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS location_id   UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comp_min      NUMERIC(12,2) CHECK (comp_min IS NULL OR comp_min >= 0),
  ADD COLUMN IF NOT EXISTS comp_max      NUMERIC(12,2) CHECK (comp_max IS NULL OR comp_max >= 0),
  ADD COLUMN IF NOT EXISTS comp_currency TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location_id);

-- ── Postings ──────────────────────────────────────────────────
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS visibility         TEXT NOT NULL DEFAULT 'listed'
    CHECK (visibility IN ('listed', 'unlisted')),        -- unlisted = live but only via direct link
  ADD COLUMN IF NOT EXISTS location_id        UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS show_compensation  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comp_min           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS comp_max           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS comp_currency      TEXT,
  ADD COLUMN IF NOT EXISTS social_description TEXT,
  ADD COLUMN IF NOT EXISTS public_token       TEXT;      -- per-posting apply link (/apply/p/<token>)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_job_postings_public_token ON job_postings(public_token) WHERE public_token IS NOT NULL;

-- Mint a public token for every posting (existing + future).
CREATE OR REPLACE FUNCTION set_job_posting_public_token() RETURNS trigger AS $$
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := encode(gen_random_bytes(12), 'hex');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_job_postings_public_token ON job_postings;
CREATE TRIGGER trg_job_postings_public_token BEFORE INSERT ON job_postings
  FOR EACH ROW EXECUTE FUNCTION set_job_posting_public_token();
UPDATE job_postings SET public_token = encode(gen_random_bytes(12), 'hex') WHERE public_token IS NULL;

-- ── Job templates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,                                  -- what this template is for
  -- Job fields
  title             TEXT,
  department_id     UUID REFERENCES departments(id) ON DELETE SET NULL,
  location_id       UUID REFERENCES locations(id)   ON DELETE SET NULL,
  employment_type   TEXT,
  work_model        TEXT CHECK (work_model IS NULL OR work_model IN ('remote', 'hybrid', 'onsite')),
  level             TEXT,
  confidentiality   TEXT NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public', 'confidential')),
  comp_min          NUMERIC(12,2),
  comp_max          NUMERIC(12,2),
  comp_currency     TEXT,
  jd                TEXT,                                   -- job description (rich HTML)
  intake            JSONB NOT NULL DEFAULT '{}',            -- team_context / key_requirements / nice_to_have / target_companies …
  custom_fields     JSONB NOT NULL DEFAULT '{}',
  -- Linked pieces
  plan_template_id  UUID REFERENCES plan_templates(id) ON DELETE SET NULL,
  posting           JSONB,                                  -- draft posting {title, description, channel, visibility}
  is_active         BOOLEAN NOT NULL DEFAULT true,
  source_job_id     UUID REFERENCES jobs(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_templates_org ON job_templates(org_id, is_active);
CREATE TRIGGER set_job_templates_updated_at BEFORE UPDATE ON job_templates FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
ALTER TABLE job_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_job_templates" ON job_templates FOR ALL USING (true) WITH CHECK (true);

-- ── Requisitions: backfill, target hire date, number ──────────
ALTER TABLE openings
  ADD COLUMN IF NOT EXISTS is_backfill      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backfill_for     TEXT,           -- who is being replaced (free text)
  ADD COLUMN IF NOT EXISTS target_hire_date DATE,
  ADD COLUMN IF NOT EXISTS number           INT;            -- human-readable, per org (REQ-42)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_openings_number ON openings(org_id, number) WHERE number IS NOT NULL;

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS opening_number_prefix TEXT NOT NULL DEFAULT 'REQ',
  ADD COLUMN IF NOT EXISTS opening_next_number   INT  NOT NULL DEFAULT 1;

-- Assign the next number per org on insert (row-locked counter in org_settings).
CREATE OR REPLACE FUNCTION assign_opening_number() RETURNS trigger AS $$
DECLARE n INT;
BEGIN
  IF NEW.number IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO org_settings (org_id) VALUES (NEW.org_id) ON CONFLICT (org_id) DO NOTHING;
  UPDATE org_settings SET opening_next_number = opening_next_number + 1
    WHERE org_id = NEW.org_id RETURNING opening_next_number - 1 INTO n;
  NEW.number := n;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_openings_number ON openings;
CREATE TRIGGER trg_openings_number BEFORE INSERT ON openings
  FOR EACH ROW EXECUTE FUNCTION assign_opening_number();

-- Backfill numbers for existing requisitions in creation order, and bump counters.
WITH numbered AS (
  SELECT id, org_id, row_number() OVER (PARTITION BY org_id ORDER BY created_at, id) AS rn
  FROM openings WHERE number IS NULL
)
UPDATE openings o SET number = n.rn FROM numbered n WHERE o.id = n.id;
INSERT INTO org_settings (org_id, opening_next_number)
  SELECT org_id, COALESCE(MAX(number), 0) + 1 FROM openings GROUP BY org_id
ON CONFLICT (org_id) DO UPDATE SET opening_next_number = GREATEST(org_settings.opening_next_number, EXCLUDED.opening_next_number);

-- Backfill job comp/location from the first linked requisition where empty.
UPDATE jobs j SET
  comp_min      = COALESCE(j.comp_min, o.comp_min),
  comp_max      = COALESCE(j.comp_max, o.comp_max),
  comp_currency = COALESCE(j.comp_currency, o.comp_currency),
  location_id   = COALESCE(j.location_id, o.location_id)
FROM (
  SELECT DISTINCT ON (jo.job_id) jo.job_id, op.comp_min, op.comp_max, op.comp_currency, op.location_id
  FROM job_openings jo JOIN openings op ON op.id = jo.opening_id ORDER BY jo.job_id, jo.linked_at
) o WHERE o.job_id = j.id;
