-- ============================================================
-- 050: Bridge users ↔ employee_profiles + enable manager-routed approvals.
--
-- WHY: `users` (Clerk app users) and `employee_profiles` (hired people) have
-- no direct link today — the bridge is fragile (users.email → people.email →
-- employee_profile.person_id) and not every employee is a Clerk user. To route
-- approvals to "the requester's manager" reliably, an employee_profile needs a
-- first-class FK to a user.
--
-- Adds employee_profiles.user_id (nullable; not every employee is an app user),
-- backfills via email match + active org_members in the same org, then extends
-- the approval_chain_steps approver_type CHECK to allow 'manager' (the resolver
-- in src/lib/approvals/approver-resolver.ts uses this bridge at step activation).
-- ============================================================

-- ── user_id on employee_profiles ─────────────────────────────
ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_profiles_user ON employee_profiles(user_id);

-- At most one live (pending|active) employee per user per org. A terminated
-- employee can be rehired later under the same user without a collision.
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_profiles_live_user
  ON employee_profiles(org_id, user_id)
  WHERE user_id IS NOT NULL AND status IN ('pending', 'active');

-- ── backfill: link by email + active org_members in same org ─
-- Joins:
--   employee_profile  → people (by person_id, in same org)
--   people.email      = users.email
--   users             → org_members (active row in employee's org)
-- Only updates rows that don't already have user_id set.
UPDATE employee_profiles ep
SET user_id = u.id
FROM users u
JOIN org_members om ON om.user_id = u.id
JOIN people     p  ON p.email     = u.email
WHERE p.id = ep.person_id
  AND p.org_id = ep.org_id
  AND om.org_id = ep.org_id
  AND om.is_active = true
  AND ep.user_id IS NULL;

-- ── approver_type: allow 'manager' ───────────────────────────
ALTER TABLE approval_chain_steps DROP CONSTRAINT IF EXISTS approval_chain_steps_approver_type_check;
ALTER TABLE approval_chain_steps ADD CONSTRAINT approval_chain_steps_approver_type_check
  CHECK (approver_type IN ('user', 'role', 'hiring_team_member', 'group', 'manager'));
