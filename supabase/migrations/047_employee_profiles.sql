-- ============================================================
-- 047: Employee Profiles — closing the apply → employee lifecycle.
-- This is where RecruiterStack stops being a typical ATS (Greenhouse/Ashby
-- abandon the record at hire) and becomes a unified solution: the SAME person
-- who applied and was hired now becomes an employee, on one durable identity.
-- See docs/hire-to-employee-research.md and docs/canonical-data-model.md.
--
-- Lifecycle (one person_id throughout):
--   Candidate --offer accepted--> Pre-hire (PENDING, serving notice)
--             --joins org-------> Employee (ACTIVE) --leaves--> TERMINATED
--
-- Employee creation is an automatic, CENTRALIZED consequence of the hire
-- disposition (DB trigger), not logic re-implemented at each of the ~7 TA hire
-- surfaces. The TA keeps freedom to mark "hired" anywhere; the pre-hire record
-- appears exactly once. Depends on 046 (people) and 045 (per-org candidate id).
-- ============================================================

-- ── employee_profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT NOT NULL,
  person_id      UUID NOT NULL REFERENCES people(id),
  -- The candidacy / application that became this hire (provenance; nullable
  -- because a hire can be recorded candidate-first via offer acceptance).
  candidate_id   UUID REFERENCES candidates(id)   ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  department_id  UUID REFERENCES departments(id)  ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'terminated')),
  hired_at       TIMESTAMPTZ,             -- offer accepted / hire disposition moment
  start_date     DATE,                    -- first actual working day (≠ hire date)
  joined_at      TIMESTAMPTZ,             -- when pending → active happened
  terminated_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_org    ON employee_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_person ON employee_profiles(person_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_status ON employee_profiles(org_id, status);

-- One live (pending|active) employee per person per org — gives idempotency for
-- the triggers and prevents duplicate active records, while still allowing a
-- TERMINATED person to be rehired later (a new live record).
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_profiles_live_person
  ON employee_profiles(org_id, person_id)
  WHERE status IN ('pending', 'active');

CREATE TRIGGER set_employee_profiles_updated_at
  BEFORE UPDATE ON employee_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_employee_profiles" ON employee_profiles FOR ALL USING (true) WITH CHECK (true);

-- ── hire → pending employee, fired centrally ─────────────────
-- When a candidate is dispositioned 'hired' (e.g. offer accepted sets the
-- candidate hired), create the pre-hire employee record. Person is resolved
-- from candidates.person_id, falling back to find-or-create by (org_id, email)
-- so the hook is robust even if person_id was never backfilled on that row.
CREATE OR REPLACE FUNCTION create_pending_employee_from_candidate_hire()
RETURNS TRIGGER AS $$
DECLARE
  v_person_id UUID;
BEGIN
  v_person_id := NEW.person_id;

  IF v_person_id IS NULL THEN
    INSERT INTO people (org_id, email, name, phone, linkedin_url)
    VALUES (NEW.org_id, NEW.email, NEW.name, NEW.phone, NEW.linkedin_url)
    ON CONFLICT (org_id, email) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_person_id;
  END IF;

  INSERT INTO employee_profiles (org_id, person_id, candidate_id, status, hired_at)
  VALUES (NEW.org_id, v_person_id, NEW.id, 'pending', now())
  ON CONFLICT (org_id, person_id) WHERE status IN ('pending', 'active') DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_candidate_hire_to_employee
  AFTER UPDATE ON candidates
  FOR EACH ROW
  WHEN (NEW.status = 'hired' AND OLD.status IS DISTINCT FROM 'hired')
  EXECUTE FUNCTION create_pending_employee_from_candidate_hire();

-- Same invariant for the application-side hire disposition (some surfaces set
-- applications.status = 'hired' instead of candidates.status). Resolves the
-- person via the linked candidate and records application provenance.
CREATE OR REPLACE FUNCTION create_pending_employee_from_application_hire()
RETURNS TRIGGER AS $$
DECLARE
  v_cand     candidates%ROWTYPE;
  v_person_id UUID;
BEGIN
  SELECT * INTO v_cand FROM candidates WHERE id = NEW.candidate_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_person_id := v_cand.person_id;
  IF v_person_id IS NULL THEN
    INSERT INTO people (org_id, email, name, phone, linkedin_url)
    VALUES (v_cand.org_id, v_cand.email, v_cand.name, v_cand.phone, v_cand.linkedin_url)
    ON CONFLICT (org_id, email) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_person_id;
  END IF;

  INSERT INTO employee_profiles (org_id, person_id, candidate_id, application_id, status, hired_at)
  VALUES (NEW.org_id, v_person_id, NEW.candidate_id, NEW.id, 'pending', now())
  ON CONFLICT (org_id, person_id) WHERE status IN ('pending', 'active') DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_application_hire_to_employee
  AFTER UPDATE ON applications
  FOR EACH ROW
  WHEN (NEW.status = 'hired' AND OLD.status IS DISTINCT FROM 'hired')
  EXECUTE FUNCTION create_pending_employee_from_application_hire();

-- ── backfill: anyone ALREADY hired before these triggers existed ──
-- Triggers only catch new transitions, so seed pending employees for people
-- whose candidate OR application is already 'hired' and who have no live
-- employee record. One row per (org_id, person_id); application provenance
-- attached when a hired application exists.
INSERT INTO employee_profiles (org_id, person_id, candidate_id, application_id, status, hired_at)
SELECT DISTINCT ON (c.org_id, c.person_id)
       c.org_id, c.person_id, c.id, a.id, 'pending', now()
FROM candidates c
LEFT JOIN applications a
  ON a.candidate_id = c.id AND a.status = 'hired'
WHERE c.person_id IS NOT NULL
  AND (c.status = 'hired' OR a.status = 'hired')
  AND NOT EXISTS (
    SELECT 1 FROM employee_profiles ep
    WHERE ep.org_id = c.org_id AND ep.person_id = c.person_id
      AND ep.status IN ('pending', 'active')
  )
ORDER BY c.org_id, c.person_id, a.status NULLS LAST
ON CONFLICT (org_id, person_id) WHERE status IN ('pending', 'active') DO NOTHING;
