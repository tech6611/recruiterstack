-- ============================================================
-- 092: Seed the "Hiring Manager" system RBAC role per org.
--
-- Part of the "Hiring Managers as first-class participants" work. Provisioned
-- hiring-manager seats (org_members.role = 'hiring_manager', is_free_seat=true,
-- migration 090) are assigned this role by ensureDefaultMemberRole.
--
-- SCOPE (narrow/safe first pass): a hiring manager sees and approves only their
-- OWN requisitions and approvals. They are deliberately NOT granted
-- `recruiting:view` or `people:view`, so the ~30 candidate/job/interview/
-- dashboard list routes (all gated on `recruiting:view`) deny them by default —
-- no risk of over-sharing another team's data. Widening to their own
-- candidates/interviews is a deliberate fast-follow, not this migration.
--
-- Capabilities (vocabulary in src/lib/permissions.ts):
--   openings:view, openings:approve, approvals:view, approvals:approve
-- The openings list/detail routes additionally row-scope results to
-- (hiring_manager_id = viewer OR recruiter_id = viewer) when the viewer is a
-- hiring manager, so `openings:view` never leaks other teams' requisitions.
--
-- Mirrors the Owner/Recruiter seeding in 065_rbac.sql: backfills every existing
-- org (DISTINCT org_id from org_members). Idempotent (ON CONFLICT DO NOTHING).
-- ============================================================

-- ── Seed the Hiring Manager system role per org ─────────────
INSERT INTO rbac_roles (org_id, name, description, is_system, is_owner)
SELECT DISTINCT org_id, 'Hiring Manager',
  'Views and approves only their own requisitions and approvals. No settings, analytics, candidates or edit.',
  true, false
FROM org_members
ON CONFLICT (org_id, name) DO NOTHING;

-- ── Hiring Manager capabilities (minimal, approve-focused) ──
INSERT INTO rbac_role_capabilities (role_id, capability)
SELECT r.id, c.cap
FROM rbac_roles r
CROSS JOIN (VALUES
  ('openings:view'),   ('openings:approve'),
  ('approvals:view'),  ('approvals:approve')
) AS c(cap)
WHERE r.is_system AND r.name = 'Hiring Manager'
ON CONFLICT DO NOTHING;
