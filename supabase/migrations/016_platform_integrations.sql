-- Migration 016: Platform Integrations (Google Calendar/Meet, future Zoom & Teams)
-- Adds OAuth token storage to org_settings and enriches interviews table.

-- ── Google OAuth columns on org_settings ──────────────────────────────────────
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS google_oauth_access_token   TEXT,
  ADD COLUMN IF NOT EXISTS google_oauth_refresh_token  TEXT,
  ADD COLUMN IF NOT EXISTS google_oauth_token_expiry   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_connected_email      TEXT;

-- ── Zoom OAuth columns (stubbed for future implementation) ─────────────────────
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS zoom_account_id    TEXT,
  ADD COLUMN IF NOT EXISTS zoom_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS zoom_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS zoom_token_expiry  TIMESTAMPTZ;

-- ── Microsoft Teams OAuth columns (stubbed for future implementation) ──────────
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS ms_tenant_id      TEXT,
  ADD COLUMN IF NOT EXISTS ms_access_token   TEXT,
  ADD COLUMN IF NOT EXISTS ms_refresh_token  TEXT,
  ADD COLUMN IF NOT EXISTS ms_token_expiry   TIMESTAMPTZ;

-- ── Enrich interviews table ───────────────────────────────────────────────────
-- interviewer_email: needed to add interviewer as a guest on Google Calendar events
-- calendar_event_id: Google Calendar event ID for the created Meet/event
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS interviewer_email  TEXT,
  ADD COLUMN IF NOT EXISTS calendar_event_id  TEXT;
