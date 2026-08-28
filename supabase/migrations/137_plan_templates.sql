-- 137_plan_templates.sql
--
-- Reusable interview-plan templates. A recruiter can save a job's pipeline plan
-- (its custom Active + Offer stages, with funnel-step mappings and playbook text)
-- as a named, org-wide template, then apply it to another job to reuse the flow.
--
-- Mirrors role_templates (migration 111): a single table holding the snapshot as
-- JSONB, org-scoped, service-role RLS. The stages array stores each stage's config;
-- playbook.next_stage_index is an ordinal (not a stage id) so apply can remap it to
-- the target job's freshly-created stage ids.

CREATE TABLE IF NOT EXISTS plan_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL,
  name          text NOT NULL,
  description   text,
  -- Ordered snapshot of the custom (active/offer) stages:
  -- [{ name, zone, order_index, color, is_promotion_gate, funnel_step,
  --    playbook: { entry_intent, advance_criteria, reject_to, next_stage_index } }]
  stages        jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_templates_org
  ON plan_templates(org_id, created_at DESC);

ALTER TABLE plan_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_plan_templates ON plan_templates;
CREATE POLICY service_role_all_plan_templates ON plan_templates
  FOR ALL USING (true) WITH CHECK (true);
