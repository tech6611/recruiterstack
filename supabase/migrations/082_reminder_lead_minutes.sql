-- ============================================================
-- 082: Configurable interview reminder intervals.
--
-- Adds org_settings.reminder_lead_minutes — the list of "minutes
-- before the interview" at which automated reminders are sent to
-- the candidate + interviewer (e.g. {1440, 60} = 24h and 1h before).
--
-- An empty array turns reminders off for the org. The default
-- {1440, 60} preserves the previously hard-coded 24h + 1h behaviour,
-- and ADD COLUMN ... DEFAULT backfills every existing row with it.
--
-- Read/written by the Next.js app directly (src/lib/interviews/reminders.ts,
-- /api/scheduling-settings) — the Django-proxied /api/org-settings does not
-- touch this column. Additive, reversible (drop the column → reverts to the
-- code default). Metadata-only change in Postgres 11+ (constant default).
-- ============================================================

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS reminder_lead_minutes integer[] NOT NULL DEFAULT '{1440,60}'::integer[];
