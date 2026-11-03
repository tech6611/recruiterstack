-- 158_copilot_pending_actions.sql
-- Copilot approval lock. When the copilot wants to do something risky (send an
-- email/WhatsApp, bulk-reject, change an offer, terminate…), the server does NOT
-- run it. It stores the exact action here and shows the recruiter an approval
-- card. Only the recruiter's click on "Approve" runs it — once (status moves
-- pending → executing → done atomically), within 30 minutes, for the same user.
-- Additive only — no existing table is touched.

CREATE TABLE IF NOT EXISTS copilot_pending_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- [{ tool, args, preview }] — exactly what will run, and what the card showed.
  actions     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'executing', 'done', 'cancelled')),
  -- [{ preview, result }] after running.
  results     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  decided_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_copilot_pending_actions_user
  ON copilot_pending_actions (org_id, user_id, created_at DESC);

-- Server-only: RLS on with NO policy, so only the service role can touch it.
ALTER TABLE copilot_pending_actions ENABLE ROW LEVEL SECURITY;
