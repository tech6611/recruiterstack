-- ============================================================
-- 060: Allow 'SG' in payroll_org_settings.country_code.
--
-- Adds Singapore as the second supported country engine. The CHECK
-- constraint was originally locked to 'IN' only; v1 has now proven the
-- pluggable engine interface with a second concrete implementation
-- (see src/modules/payroll/domain/tax/singapore.ts).
--
-- Defaults remain India-flavored (state KA, regime 'new', metro true)
-- because most existing customers / fresh installs are Indian. Singapore
-- orgs flip the country in /settings/payroll; the state / regime / metro
-- columns become unused (engine ignores them).
-- ============================================================

ALTER TABLE payroll_org_settings
  DROP CONSTRAINT IF EXISTS payroll_org_settings_country_code_check;

ALTER TABLE payroll_org_settings
  ADD CONSTRAINT payroll_org_settings_country_code_check
  CHECK (country_code IN ('IN', 'SG'));
