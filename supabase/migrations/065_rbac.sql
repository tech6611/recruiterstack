-- ============================================================
-- 065: Per-member RBAC — roles, capabilities, assignments (RBAC Slice 0).
--
-- Hybrid model: named roles (capability bundles) + per-member allow/deny
-- overrides. Capability = "<module>:<action>" (vocabulary defined in code at
-- src/lib/permissions.ts). Owner roles (is_owner) grant ALL capabilities and
-- manage permissions — the resolver short-circuits them, so they need no
-- rbac_role_capabilities rows.
--
-- Tables are prefixed `rbac_` to avoid colliding with the pre-existing legacy
-- ATS `roles` table (job-role templates, migration 001).
--
-- This slice is MODEL ONLY — no enforcement is wired yet. The seed + backfill
-- are designed to PRESERVE today's access exactly:
--   - admins (org_members.role = 'admin')  → Owner  (all capabilities)
--   - everyone else                        → Recruiter (recruiting/openings/analytics,
--                                            i.e. the non-adminOnly surfaces they see today)
--
-- Idempotent (IF NOT EXISTS + ON CONFLICT DO NOTHING). Reversible: drop the four
-- rbac_* tables (no other table references them).
-- ============================================================

CREATE TABLE IF NOT EXISTS rbac_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_owner    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS rbac_role_capabilities (
  role_id    UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  PRIMARY KEY (role_id, capability)
);

CREATE TABLE IF NOT EXISTS rbac_member_roles (
  org_id     TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS rbac_member_overrides (
  org_id     TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  effect     TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  PRIMARY KEY (org_id, user_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_rbac_roles_org             ON rbac_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_rbac_member_roles_org_user ON rbac_member_roles(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_member_overrides_org_user ON rbac_member_overrides(org_id, user_id);

ALTER TABLE rbac_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_member_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_member_overrides  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_rbac_roles"             ON rbac_roles             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_rbac_role_capabilities" ON rbac_role_capabilities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_rbac_member_roles"      ON rbac_member_roles      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_rbac_member_overrides"  ON rbac_member_overrides  FOR ALL USING (true) WITH CHECK (true);

-- ── Seed system roles per org ───────────────────────────────
INSERT INTO rbac_roles (org_id, name, description, is_system, is_owner)
SELECT DISTINCT org_id, 'Owner', 'Full access; manages roles and permissions.', true, true
FROM org_members
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO rbac_roles (org_id, name, description, is_system, is_owner)
SELECT DISTINCT org_id, 'Recruiter', 'Recruiting, openings and analytics. The default member role.', true, false
FROM org_members
ON CONFLICT (org_id, name) DO NOTHING;

-- Recruiter capabilities. Owner needs none (resolver grants Owner all).
-- This set mirrors the non-adminOnly surfaces a non-admin sees today.
INSERT INTO rbac_role_capabilities (role_id, capability)
SELECT r.id, c.cap
FROM rbac_roles r
CROSS JOIN (VALUES
  ('recruiting:view'), ('recruiting:edit'),
  ('openings:view'),   ('openings:edit'),
  ('analytics:view')
) AS c(cap)
WHERE r.is_system AND r.name = 'Recruiter'
ON CONFLICT DO NOTHING;

-- ── Backfill member assignments (behavior-preserving) ───────
INSERT INTO rbac_member_roles (org_id, user_id, role_id)
SELECT m.org_id, m.user_id, r.id
FROM org_members m
JOIN rbac_roles r
  ON r.org_id = m.org_id
 AND r.is_system
 AND r.name = CASE WHEN m.role = 'admin' THEN 'Owner' ELSE 'Recruiter' END
ON CONFLICT DO NOTHING;
