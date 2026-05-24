-- ============================================================
-- 046: People — the canonical universal human record.
-- A person can be a lead, candidate, applicant, referral, employee, alumni,
-- or future rehire. This is the identity anchor for unified data across the
-- apply → employee lifecycle. See docs/canonical-data-model.md.
--
-- `candidates` currently doubles as person + candidate-profile. This slice
-- extracts identity (name/email/phone/linkedin) into `people` and links each
-- candidate to its person via candidates.person_id. The `candidates` table is
-- intentionally NOT renamed (decision 2026-05-24); it now holds the candidate
-- *profile* (resume, skills, status, ai_*) and points at a person.
--
-- Additive and reversible: candidates.person_id is nullable here; a later
-- slice makes it NOT NULL once every write path populates it.
-- Depends on 045 (per-org email uniqueness) for the UNIQUE(org_id,email) below.
-- ============================================================

-- ── people ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,                 -- Clerk org id (matches candidates.org_id)
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  linkedin_url TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_people_org  ON people(org_id);

CREATE TRIGGER set_people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_people" ON people FOR ALL USING (true) WITH CHECK (true);

-- ── backfill: one person per distinct (org_id, email) ─────────
-- Keep the earliest candidate's identity fields as the canonical person.
INSERT INTO people (org_id, email, name, phone, linkedin_url, created_at)
SELECT DISTINCT ON (org_id, email)
       org_id, email, name, phone, linkedin_url, created_at
FROM candidates
ORDER BY org_id, email, created_at ASC
ON CONFLICT (org_id, email) DO NOTHING;

-- ── link candidates → people ──────────────────────────────────
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES people(id);

UPDATE candidates c
SET person_id = p.id
FROM people p
WHERE p.org_id = c.org_id
  AND p.email  = c.email
  AND c.person_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_person ON candidates(person_id);
