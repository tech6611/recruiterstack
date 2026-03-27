-- Add connected email columns for Zoom and Microsoft (token stubs already exist from 016)
-- and a meeting_platform column on interviews to track which provider created the meeting.

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS zoom_connected_email TEXT,
  ADD COLUMN IF NOT EXISTS ms_connected_email   TEXT;

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS meeting_platform TEXT;  -- 'google_meet' | 'zoom' | 'ms_teams'
