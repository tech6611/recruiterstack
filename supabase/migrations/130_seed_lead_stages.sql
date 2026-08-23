-- 130_seed_lead_stages.sql
--
-- Slice 1b of "Pipeline Plans & Automation Agents": give every job a Lead zone.
--
-- Building on migration 123 (which added pipeline_stages.zone + is_promotion_gate),
-- this seeds the three Ashby-style lead stages — New lead → Reached out → Replied
-- — ahead of the active pipeline, for BOTH new jobs (via the create trigger) and
-- existing canonical jobs (via a one-time, non-destructive backfill).
--
-- Non-destructive by design: lead stages use NEGATIVE order_index (-3/-2/-1) so
-- they sort ahead of "Applied" (order 0) WITHOUT renumbering any existing stage.
-- "Replied" is the promotion gate — the lead-zone stage a candidate crosses from
-- into the active pipeline.
--
-- No candidacy is moved: applications keep landing in the first ACTIVE stage
-- ("Applied"), because getFirstJobStage() is zone-aware. The "sourced person
-- becomes a lead" behaviour change is still Slice 5. The only visible effect is
-- that boards now show three (empty) lead columns until Slice 5 fills them.
--
-- Idempotent: the trigger uses the full 9-stage set; the backfill inserts lead
-- stages only for jobs that don't already have a lead-zone stage.

-- ── New jobs: seed all 9 stages (3 lead + the original 6), zoned ─────────────
CREATE OR REPLACE FUNCTION create_default_job_pipeline_stages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pipeline_stages (job_id, org_id, name, order_index, color, zone, is_promotion_gate) VALUES
    -- Lead zone (pre-application). Negative order_index keeps them ahead of Applied.
    (NEW.id, NEW.org_id, 'New lead',     -3, 'slate',   'lead',      false),
    (NEW.id, NEW.org_id, 'Reached out',  -2, 'blue',    'lead',      false),
    (NEW.id, NEW.org_id, 'Replied',      -1, 'violet',  'lead',      true),   -- promotion gate
    -- Active pipeline (unchanged from migration 066).
    (NEW.id, NEW.org_id, 'Applied',       0, 'slate',   'active',    false),
    (NEW.id, NEW.org_id, 'Screening',     1, 'blue',    'active',    false),
    (NEW.id, NEW.org_id, 'Phone Screen',  2, 'violet',  'active',    false),
    (NEW.id, NEW.org_id, 'Interview',     3, 'amber',   'active',    false),
    (NEW.id, NEW.org_id, 'Offer',         4, 'emerald', 'offer',     false),
    (NEW.id, NEW.org_id, 'Hired',         5, 'green',   'completed', false);
  RETURN NEW;
END;
$$;

-- Trigger definition itself is unchanged (still AFTER INSERT on jobs); recreate
-- defensively so a fresh apply is self-contained.
DROP TRIGGER IF EXISTS trg_create_default_job_pipeline_stages ON jobs;
CREATE TRIGGER trg_create_default_job_pipeline_stages
  AFTER INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION create_default_job_pipeline_stages();

-- ── Existing jobs: backfill the three lead stages where missing ─────────────
INSERT INTO pipeline_stages (job_id, org_id, name, order_index, color, zone, is_promotion_gate)
SELECT j.id, j.org_id, s.name, s.order_index, s.color, s.zone, s.is_promotion_gate
FROM jobs j
CROSS JOIN (VALUES
  ('New lead',    -3, 'slate',  'lead', false),
  ('Reached out', -2, 'blue',   'lead', false),
  ('Replied',     -1, 'violet', 'lead', true)
) AS s(name, order_index, color, zone, is_promotion_gate)
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages p
  WHERE p.job_id = j.id AND p.zone = 'lead'
);
