-- ============================================================
-- 089: phone_screen_requests — candidate-submitted availability
-- for an AI phone screen.
--
-- A sequence email can carry the {{phone_screen_scheduler}} token,
-- which renders a per-candidate public link (/phone-screen/[token]).
-- The candidate opens it and ticks whichever upcoming time windows
-- they're comfortable being called in — there is NO calendar/free-busy
-- check here (an AI places the call, so there's no human calendar to
-- book against). Their picks land in `preferred_slots`, and the
-- recruiter sees them when launching the AI phone screen.
--
--   application_id — the candidacy this request belongs to.
--   candidate_id   — denormalised for quick lookups.
--   job_id         — canonical job the application is against (nullable).
--   token          — the public bearer token in the link URL.
--   preferred_slots— JSONB array of { start, end } ISO windows the
--                    candidate selected. Empty until they submit.
--   timezone       — the candidate's browser timezone at submit, so the
--                    recruiter reads the windows in the candidate's local
--                    time.
--   status         — 'pending' (link minted, awaiting submission) →
--                    'submitted' (candidate picked windows).
--
-- Additive and reversible (drop the table → the token simply falls back
-- to its natural-language phrase). Written via the service-role admin
-- client, so RLS is enabled with a service-role-all policy to match the
-- rest of the schema.
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_screen_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  application_id    UUID NOT NULL,
  candidate_id      UUID NOT NULL,
  job_id            UUID,
  token             TEXT NOT NULL UNIQUE,
  preferred_slots   JSONB NOT NULL DEFAULT '[]',
  timezone          TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  submitted_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reuse the pending link for a candidacy (idempotent send/retry), and
-- surface the latest submission on the candidate profile.
CREATE INDEX IF NOT EXISTS idx_phone_screen_requests_app
  ON phone_screen_requests(org_id, application_id);

ALTER TABLE phone_screen_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_phone_screen_requests"
  ON phone_screen_requests FOR ALL USING (true) WITH CHECK (true);

-- Let PostgREST pick up the new table immediately.
NOTIFY pgrst, 'reload schema';
