-- ============================================================
-- 032: Users mirror table + org_members with role
-- Requisition Module step 1 — identity layer.
-- Every subsequent FK to a human (hiring_manager_id, approver, etc.)
-- points at users.id, NOT at Clerk's raw user_xxx string.
-- ============================================================

-- ── users ────────────────────────────────────────────────────
-- Mirror of Clerk users. Populated via Clerk webhooks.
-- id is our internal UUID; clerk_user_id is the Clerk pointer.
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id      TEXT NOT NULL UNIQUE,
  email              TEXT NOT NULL,
  first_name         TEXT,
  last_name          TEXT,
  full_name          TEXT,                  -- denormalized convenience
  avatar_url         TEXT,
  -- OOO / delegation (prompt: "Approver is deactivated or OOO"):
  delegate_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  deactivated_at     TIMESTAMPTZ,           -- null = active
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active        ON users(deactivated_at) WHERE deactivated_at IS NULL;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_users" ON users FOR ALL USING (true) WITH CHECK (true);

-- ── org_members ──────────────────────────────────────────────
-- A user's membership in an org, with our custom role.
-- Sourced from Clerk's org membership, but we store our own
-- role (admin / recruiter / hiring_manager / interviewer)
-- because Clerk only has admin / basic_member.
-- "Approver" is NOT a role here — it's dynamically resolved
-- per approval step (via chain step approver_type/value).
CREATE TABLE IF NOT EXISTS org_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'recruiter'
                  CHECK (role IN ('admin', 'recruiter', 'hiring_manager', 'interviewer')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org     ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user    ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role    ON org_members(org_id, role);

CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON org_members
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_org_members" ON org_members FOR ALL USING (true) WITH CHECK (true);
