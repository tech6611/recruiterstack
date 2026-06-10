-- ============================================================
-- 062: Party Model — candidates identity fields become read-only mirrors.
--
-- The architectural goal: `people` is the canonical source of truth for
-- identity (name / email / phone / linkedin_url). Role tables like
-- `candidates` carry only role-specific facts + a non-null person_id.
--
-- This migration is the safe, reversible step on that path:
--   1. Drops NOT NULL on candidates.name + candidates.email so writers
--      can stop passing them.
--   2. Adds a BEFORE INSERT/UPDATE trigger that fills any NULL identity
--      field from the linked people row, so existing readers that still
--      do candidates.name / candidates.email keep working.
--   3. People-side trigger: when a people row's identity changes, sync
--      the change to every candidates row linked via person_id. Keeps
--      the denormalized cache consistent.
--
-- A future migration (when the 27 join-read sites are refactored to
-- read `candidates(person:people(name, email))`) will drop these
-- columns entirely. Until then they live as DB-enforced read mirrors.
--
-- Idempotent / safe to re-run.
-- ============================================================

-- ── Step 1: Drop NOT NULL on identity columns ───────────────────────────────
-- phone and linkedin_url are already nullable; the operation no-ops there.
ALTER TABLE candidates ALTER COLUMN name  DROP NOT NULL;
ALTER TABLE candidates ALTER COLUMN email DROP NOT NULL;

-- ── Step 2: Trigger — fill candidates identity from people on INSERT/UPDATE ─
-- Postgres parses `NEW.col` in a SELECT INTO target list as schema.table, so
-- we load the people row into a local variable and then assign field-by-field.
CREATE OR REPLACE FUNCTION fill_candidate_identity_from_person()
RETURNS TRIGGER AS $$
DECLARE
  p_row people%ROWTYPE;
BEGIN
  IF NEW.person_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip the lookup when every identity field is already provided.
  IF NEW.name IS NOT NULL AND NEW.email IS NOT NULL
     AND NEW.phone IS NOT NULL AND NEW.linkedin_url IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p_row FROM people WHERE id = NEW.person_id;
  IF FOUND THEN
    NEW.name         := COALESCE(NEW.name,         p_row.name);
    NEW.email        := COALESCE(NEW.email,        p_row.email);
    NEW.phone        := COALESCE(NEW.phone,        p_row.phone);
    NEW.linkedin_url := COALESCE(NEW.linkedin_url, p_row.linkedin_url);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_candidate_identity_from_person ON candidates;
CREATE TRIGGER trg_fill_candidate_identity_from_person
  BEFORE INSERT OR UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION fill_candidate_identity_from_person();

-- ── Step 3: Trigger — propagate people identity edits to linked candidates ──
-- When someone updates the canonical people row, mirror the change to every
-- candidate that links to that person. Only triggers when an identity field
-- actually changed (avoids churn on unrelated updates).
CREATE OR REPLACE FUNCTION propagate_people_identity_to_candidates()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.name         IS DISTINCT FROM OLD.name)
  OR (NEW.email        IS DISTINCT FROM OLD.email)
  OR (NEW.phone        IS DISTINCT FROM OLD.phone)
  OR (NEW.linkedin_url IS DISTINCT FROM OLD.linkedin_url)
  THEN
    UPDATE candidates SET
      name         = NEW.name,
      email        = NEW.email,
      phone        = NEW.phone,
      linkedin_url = NEW.linkedin_url
    WHERE person_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_propagate_people_identity_to_candidates ON people;
CREATE TRIGGER trg_propagate_people_identity_to_candidates
  AFTER UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION propagate_people_identity_to_candidates();

-- ── Step 4: Backfill any candidates rows that have null person_id ───────────
-- Defensive: link orphan candidates to people by org_id + email. Creates a
-- people row when no match exists. After this, every candidate has a
-- person_id and the trigger above keeps identity in sync.
DO $$
DECLARE
  cand RECORD;
  pid  UUID;
BEGIN
  FOR cand IN
    SELECT id, org_id, name, email, phone, linkedin_url
    FROM candidates
    WHERE person_id IS NULL
  LOOP
    -- Try to find a matching people row.
    SELECT id INTO pid
    FROM people
    WHERE org_id = cand.org_id AND email = cand.email
    LIMIT 1;

    -- Create one if missing.
    IF pid IS NULL THEN
      INSERT INTO people (org_id, name, email, phone, linkedin_url)
      VALUES (cand.org_id, cand.name, cand.email, cand.phone, cand.linkedin_url)
      RETURNING id INTO pid;
    END IF;

    UPDATE candidates SET person_id = pid WHERE id = cand.id;
  END LOOP;
END $$;
