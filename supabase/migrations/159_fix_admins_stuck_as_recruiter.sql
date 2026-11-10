-- 159: Repair admins left with the placeholder Recruiter RBAC role.
--
-- Bug: onboarding created every member as 'recruiter' and gave them the system
-- Recruiter role, then promoted the org's first user to org_members.role =
-- 'admin' WITHOUT upgrading their RBAC role. Those founders saw only
-- Dashboard / Recruiting / Insights — no Settings or Admin menu, and no way to
-- fix it themselves (permission management is Owner-only). Code fix:
-- syncMemberRbacRole in src/lib/rbac.ts, called from /api/onboarding/role.
--
-- This one-off: every ACTIVE admin who is not yet an Owner gets their org's
-- system Owner role; then active admins who hold Owner lose the system
-- Recruiter placeholder (redundant — Owner grants everything). Custom roles
-- are left untouched. Idempotent — safe to run more than once.
--
-- No temp tables: the Supabase SQL editor doesn't keep a temp table alive
-- across statements, which broke the first version of this script.

-- Preview who will be changed (run this SELECT on its own first if you like):
-- SELECT m.org_id, m.user_id, u.email
-- FROM org_members m
-- LEFT JOIN users u ON u.id = m.user_id
-- WHERE m.role = 'admin' AND m.is_active
--   AND NOT EXISTS (
--     SELECT 1 FROM rbac_member_roles mr JOIN rbac_roles r ON r.id = mr.role_id
--     WHERE mr.org_id = m.org_id AND mr.user_id = m.user_id AND r.is_owner);

-- 1. Give stuck admins the Owner role.
INSERT INTO rbac_member_roles (org_id, user_id, role_id)
SELECT m.org_id, m.user_id, r.id
FROM org_members m
JOIN rbac_roles r
  ON r.org_id = m.org_id AND r.is_system AND r.is_owner AND r.name = 'Owner'
WHERE m.role = 'admin'
  AND m.is_active
  AND NOT EXISTS (
    SELECT 1
    FROM rbac_member_roles mr
    JOIN rbac_roles ro ON ro.id = mr.role_id
    WHERE mr.org_id = m.org_id AND mr.user_id = m.user_id AND ro.is_owner
  )
ON CONFLICT DO NOTHING;

-- 2. Drop the placeholder Recruiter role from active admins who now hold Owner.
DELETE FROM rbac_member_roles mr
USING org_members m, rbac_roles rec
WHERE mr.org_id = m.org_id
  AND mr.user_id = m.user_id
  AND m.role = 'admin'
  AND m.is_active
  AND mr.role_id = rec.id
  AND rec.org_id = mr.org_id AND rec.is_system AND rec.name = 'Recruiter'
  AND EXISTS (
    SELECT 1
    FROM rbac_member_roles o
    JOIN rbac_roles ro ON ro.id = o.role_id
    WHERE o.org_id = mr.org_id AND o.user_id = mr.user_id AND ro.is_owner
  );
