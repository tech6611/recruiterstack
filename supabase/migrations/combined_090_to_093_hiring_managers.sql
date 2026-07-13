-- ============================================================================
-- COMBINED, RE-RUNNABLE migration bundle: 090 → 093
-- "Hiring Managers as first-class participants"
--
-- Safe to run in one go, and safe to run again if you've already applied some
-- of these: every statement is idempotent (IF NOT EXISTS / DROP NOT NULL /
-- ON CONFLICT DO NOTHING / drop-then-create for the one policy). Nothing here
-- deletes data.
--
-- Wrapped in a single transaction: if any statement fails, the whole thing
-- rolls back and your database is left exactly as it was.
-- ============================================================================

BEGIN;

-- ── 090: Hiring-manager seats — free-seat model + pending users ─────────────
-- A users row with clerk_user_id IS NULL is a "pending" user (provisioned as an
-- approver before they have a login). DROP NOT NULL is a no-op if already done.
ALTER TABLE users ALTER COLUMN clerk_user_id DROP NOT NULL;

-- How this users row came to exist. NULL = normal Clerk sign-up.
ALTER TABLE users ADD COLUMN IF NOT EXISTS provisioned_via TEXT;

-- Billing carve-out: hiring-manager seats are free and excluded from paid seats.
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS is_free_seat BOOLEAN NOT NULL DEFAULT false;

-- Find pending users by email fast (the backfill-on-Clerk-accept path).
CREATE INDEX IF NOT EXISTS idx_users_pending_email
  ON users(lower(email)) WHERE clerk_user_id IS NULL;


-- ── 091: Approval step access tokens — email-link approvals ─────────────────
CREATE TABLE IF NOT EXISTS approval_step_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  approval_id  UUID NOT NULL REFERENCES approvals(id)      ON DELETE CASCADE,
  step_id      UUID NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,          -- randomBytes(32) hex
  expires_at   TIMESTAMPTZ NOT NULL,          -- 7-day TTL from mint
  used_at      TIMESTAMPTZ,                   -- one-time-use stamp (NULL = unused)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_step_tokens_token ON approval_step_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_approval_step_tokens_step  ON approval_step_access_tokens(step_id);

ALTER TABLE approval_step_access_tokens ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY has no "IF NOT EXISTS"; drop-then-create makes it re-runnable.
DROP POLICY IF EXISTS "service_role_all_approval_step_access_tokens"
  ON approval_step_access_tokens;
CREATE POLICY "service_role_all_approval_step_access_tokens"
  ON approval_step_access_tokens FOR ALL USING (true) WITH CHECK (true);


-- ── 092: Seed the "Hiring Manager" system RBAC role per org ─────────────────
INSERT INTO rbac_roles (org_id, name, description, is_system, is_owner)
SELECT DISTINCT org_id, 'Hiring Manager',
  'Views and approves only their own requisitions and approvals. No settings, analytics, candidates or edit.',
  true, false
FROM org_members
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO rbac_role_capabilities (role_id, capability)
SELECT r.id, c.cap
FROM rbac_roles r
CROSS JOIN (VALUES
  ('openings:view'),   ('openings:approve'),
  ('approvals:view'),  ('approvals:approve')
) AS c(cap)
WHERE r.is_system AND r.name = 'Hiring Manager'
ON CONFLICT DO NOTHING;


-- ── 093: Wire offers into the approval engine ───────────────────────────────
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS offers_approval_id_idx ON offers(approval_id);

COMMIT;
