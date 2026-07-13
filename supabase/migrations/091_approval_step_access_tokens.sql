-- ============================================================
-- 091: Approval step access tokens — email-link approvals
-- Lets a named approver Approve/Reject straight from an email
-- button without logging in. Each token is a 256-bit random
-- secret stored here (NOT a signed/self-contained token) so we
-- get revocability, one-time use, and an audit trail for free.
--
-- A token is bound to exactly one (approval_id, step_id, user_id)
-- triple: it can only ever act as that user, on that step, so it
-- can't be replayed against a different step or approver. When
-- the decision is recorded we stamp used_at (one-time use), and
-- the token is naturally dead once the step leaves 'pending'.
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_step_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  approval_id  UUID NOT NULL REFERENCES approvals(id)      ON DELETE CASCADE,
  step_id      UUID NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
  -- The user this token acts as. The decide runs as this user_id, so the
  -- engine's "are you an approver on this step?" guard passes unchanged.
  user_id      UUID NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,          -- randomBytes(32) hex
  expires_at   TIMESTAMPTZ NOT NULL,          -- 7-day TTL from mint
  used_at      TIMESTAMPTZ,                   -- one-time-use stamp (NULL = unused)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast public-route lookup by the secret.
CREATE INDEX IF NOT EXISTS idx_approval_step_tokens_token ON approval_step_access_tokens(token);
-- Find all tokens for a step (e.g. to expire them when the step closes).
CREATE INDEX IF NOT EXISTS idx_approval_step_tokens_step  ON approval_step_access_tokens(step_id);

ALTER TABLE approval_step_access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approval_step_access_tokens"
  ON approval_step_access_tokens FOR ALL USING (true) WITH CHECK (true);
