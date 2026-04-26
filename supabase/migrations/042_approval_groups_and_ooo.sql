-- ============================================================
-- 042: Approval groups + OOO delegation timestamp
--   - approval_groups + approval_group_members enable real group
--     approvers (Phase F's resolver had a placeholder interpretation)
--   - users.out_of_office_until lets the resolver swap to delegate_user_id
--     when the user is currently OOO
-- ============================================================

-- ── approval_groups ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_approval_groups_org ON approval_groups(org_id);

CREATE TRIGGER set_approval_groups_updated_at
  BEFORE UPDATE ON approval_groups
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE approval_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approval_groups" ON approval_groups FOR ALL USING (true) WITH CHECK (true);

-- ── approval_group_members ───────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES approval_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_group_members_group ON approval_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_approval_group_members_user  ON approval_group_members(user_id);

ALTER TABLE approval_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approval_group_members" ON approval_group_members FOR ALL USING (true) WITH CHECK (true);

-- ── users.out_of_office_until ────────────────────────────────
-- When set + in the future, the approver resolver swaps the user with
-- their delegate_user_id (recursive — delegate may also be OOO).
ALTER TABLE users ADD COLUMN IF NOT EXISTS out_of_office_until TIMESTAMPTZ;
