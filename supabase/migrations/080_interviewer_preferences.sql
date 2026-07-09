-- ============================================================
-- 080: Interviewer availability preferences.
--
-- Stores each interviewer's preferred interview hours so the
-- candidate self-schedule link (/schedule/[token]) can offer only
-- slots that fall inside those hours AND are free on their calendar.
--
-- Keyed by (org_id, email) so it works whether or not the interviewer
-- is a RecruiterStack user — interviewers are identified by email
-- throughout the scheduling code (interviews.panel, interviewer_email).
--
-- Hiring managers set this WITHOUT logging in: a recruiter (or the
-- copilot) generates an `edit_token`, and the HM opens
-- /interviewer/[edit_token] to fill in their weekly availability.
--
-- `windows` is a JSONB array of weekly availability blocks, each:
--   { "day": 0-6 (0=Sun..6=Sat), "start": minutes-from-midnight, "end": minutes }
-- e.g. Mon 10:00-16:00 → { "day": 1, "start": 600, "end": 960 }.
-- An empty array means "not set yet" — readers fall back to the
-- default of Mon-Fri 09:00-18:00 (see src/lib/domain/interviewer-preferences.ts).
--
-- Convention match (migrations 064/065/072/076): org_id TEXT, RLS
-- enabled with a single service_role_all policy (access is org-scoped
-- in code via the service-role client). Idempotent (IF NOT EXISTS).
-- Reversible: drop the table (no downstream data depends on it; absence
-- just means every interviewer falls back to the 9-6 default).
-- ============================================================

CREATE TABLE IF NOT EXISTS interviewer_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  email       TEXT NOT NULL,                          -- lowercased interviewer email
  name        TEXT,                                   -- display name, for context
  timezone    TEXT NOT NULL DEFAULT 'Asia/Kolkata',   -- IANA tz the windows are expressed in
  windows     JSONB NOT NULL DEFAULT '[]',            -- weekly availability blocks (see header)
  note        TEXT,                                   -- free-text preference note (recruiter context)
  edit_token  TEXT UNIQUE,                            -- public, no-login edit-link token
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

-- Availability lookups fetch a set of interviewer emails for one org.
CREATE INDEX IF NOT EXISTS idx_interviewer_prefs_org_email
  ON interviewer_preferences (org_id, email);

-- RLS — org-scoping enforced in code; service role bypasses.
ALTER TABLE interviewer_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_interviewer_prefs"
  ON interviewer_preferences FOR ALL USING (true) WITH CHECK (true);
