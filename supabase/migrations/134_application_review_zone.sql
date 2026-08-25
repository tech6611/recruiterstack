-- 134_application_review_zone.sql
--
-- Adds Ashby's "Application Review" zone to the pipeline — the triage zone where
-- inbound applicants are screened BEFORE they enter the interview process. It sits
-- between the LEAD zone (sourced, pre-application) and the ACTIVE interview zone:
--
--   lead → application_review → active → offer → completed
--
-- Design (Option A): we do NOT move any candidate. The "Applied" stage — where
-- every inbound applicant already lands — is simply RE-ZONED from 'active' to
-- 'application_review'. The stage id is unchanged, so nobody's candidacy moves and
-- no write path (including the Django apply flow, which assigns the "Applied"
-- stage) needs to change. Only the zone LABEL on that stage changes, so it now
-- shows under an "Application Review" tab instead of the front of the Active zone.
--
-- Sourced leads are unaffected: promote_lead targets the first ACTIVE-zone stage
-- (now "Screening", since "Applied" left the active zone), so a converted lead
-- correctly skips the review queue — matching Ashby.
--
-- applications.lifecycle (lead|active|completed, migration 123) is NOT touched: a
-- review-zone candidacy is still 'active' lifecycle.
--
-- Idempotent + additive + reversible.

-- ── 1. Widen the zone CHECK constraint to allow 'application_review' ─────────
-- Migration 123 created an inline (auto-named) column check. Drop it (both the
-- auto name and any prior run of this migration's explicit name) and re-add a
-- widened, explicitly-named constraint.
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_zone_check;
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_zone_check_v2;
ALTER TABLE pipeline_stages
  ADD CONSTRAINT pipeline_stages_zone_check_v2
  CHECK (zone IN ('lead', 'application_review', 'active', 'offer', 'completed'));

-- ── 2. Re-zone existing "Applied" stages into the review zone ────────────────
-- Non-destructive: relabels only. The stage keeps its id, order_index, and every
-- candidate in it. Guarded on the current zone so re-running is a no-op.
UPDATE pipeline_stages
  SET zone = 'application_review'
  WHERE name = 'Applied' AND zone = 'active';

-- ── 3. Seed new jobs with "Applied" already in the review zone ──────────────
-- Same 9-stage set as migration 130; only "Applied" changes zone ('active' →
-- 'application_review'). Everything else is byte-for-byte identical so the two
-- migrations stay in sync.
CREATE OR REPLACE FUNCTION create_default_job_pipeline_stages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pipeline_stages (job_id, org_id, name, order_index, color, zone, is_promotion_gate) VALUES
    -- Lead zone (pre-application). Negative order_index keeps them ahead of Applied.
    (NEW.id, NEW.org_id, 'New lead',     -3, 'slate',   'lead',               false),
    (NEW.id, NEW.org_id, 'Reached out',  -2, 'blue',    'lead',               false),
    (NEW.id, NEW.org_id, 'Replied',      -1, 'violet',  'lead',               true),   -- promotion gate
    -- Application review zone (triage of inbound applicants).
    (NEW.id, NEW.org_id, 'Applied',       0, 'slate',   'application_review', false),
    -- Active interview pipeline.
    (NEW.id, NEW.org_id, 'Screening',     1, 'blue',    'active',             false),
    (NEW.id, NEW.org_id, 'Phone Screen',  2, 'violet',  'active',             false),
    (NEW.id, NEW.org_id, 'Interview',     3, 'amber',   'active',             false),
    (NEW.id, NEW.org_id, 'Offer',         4, 'emerald', 'offer',              false),
    (NEW.id, NEW.org_id, 'Hired',         5, 'green',   'completed',          false);
  RETURN NEW;
END;
$$;

-- Trigger definition unchanged (still AFTER INSERT on jobs); recreate defensively
-- so a fresh apply is self-contained.
DROP TRIGGER IF EXISTS trg_create_default_job_pipeline_stages ON jobs;
CREATE TRIGGER trg_create_default_job_pipeline_stages
  AFTER INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION create_default_job_pipeline_stages();
