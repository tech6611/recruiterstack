-- 139_plan_template_rules.sql
--
-- Interview-plan templates now also capture the automation rules (from every stage,
-- including framework stages like "Applied"), stored as portable references that
-- apply remaps to the target job's stage ids. Add the column that holds them.
--
-- Additive + idempotent. Existing templates default to an empty rules array, so
-- they apply exactly as before (no rules copied) — same graceful behaviour.

ALTER TABLE plan_templates
  ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '[]'::jsonb;
