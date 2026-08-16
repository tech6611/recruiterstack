-- 111_role_templates.sql
-- Recruiting Knowledge (Component 02) — reusable role calibrations. A saved role
-- template is an ICP snapshot (hard gates + competencies) detached from any one
-- job, so a NEW req can start from a proven calibration instead of a cold,
-- JD-derived seed. "Calibrate a role once, reuse it" (Metaview's Talent Map Method).
--
-- Shape mirrors the icps table's gates/competencies (same JSONB, same app-level
-- Zod validation, no new enums). Not versioned — a template is a starting point you
-- copy from; the resulting ICP is what gets versioned per job.

CREATE TABLE IF NOT EXISTS role_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL,
  name          text NOT NULL,
  description   text,
  must_haves    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- IcpMustHave[]   (hard gates)
  competencies  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- IcpCompetency[] (weights sum 100)
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,  -- the job it was saved from
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_templates_org ON role_templates(org_id, created_at DESC);

-- Access is via the service-role server client (RLS bypassed there); enable RLS
-- with a permissive service-role policy, matching the rest of the schema.
ALTER TABLE role_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_role_templates" ON role_templates FOR ALL USING (true) WITH CHECK (true);
