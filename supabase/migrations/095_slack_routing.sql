-- ============================================================
-- 094: org_settings.slack_routing — per-event Slack delivery rules
--
-- The Slack hub lets each org decide, per lifecycle event, WHERE a
-- notification goes: to the shared channel (via the incoming webhook),
-- and/or as a direct message to specific roles (recruiter / hiring
-- manager). Before this, routing was hard-coded in each API route.
--
-- Shape (JSONB): a map of event key → { channel, dm_roles }, e.g.
--   {
--     "candidate_applied": { "channel": true,  "dm_roles": [] },
--     "stage_moved":       { "channel": true,  "dm_roles": ["hiring_manager"] },
--     "candidate_hired":   { "channel": true,  "dm_roles": ["hiring_manager"] }
--   }
--   channel  — post to the org's Slack channel webhook.
--   dm_roles — roles to DM (subset of 'recruiter', 'hiring_manager'),
--              resolved to real Slack users by email at send time.
--
-- The default below reproduces the pre-hub behaviour exactly, so orgs
-- that never touch the settings screen see no change. Any event key
-- absent from the map falls back to that same default in code.
--
-- Additive and reversible (drop the column → code falls back to its
-- built-in defaults).
-- ============================================================

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS slack_routing JSONB NOT NULL DEFAULT '{
    "candidate_applied": { "channel": true, "dm_roles": [] },
    "stage_moved":       { "channel": true, "dm_roles": ["hiring_manager"] },
    "candidate_hired":   { "channel": true, "dm_roles": ["hiring_manager"] }
  }'::jsonb;

-- Let PostgREST pick up the new column immediately.
NOTIFY pgrst, 'reload schema';
