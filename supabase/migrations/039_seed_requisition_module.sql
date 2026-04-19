-- ============================================================
-- 039: Seed data for the Requisition module (local dev / tests)
-- Idempotent via fixed UUIDs + ON CONFLICT DO NOTHING.
-- Org id: 'seed' (matches the convention in migration 007).
-- ============================================================

-- ── users ────────────────────────────────────────────────────
INSERT INTO users (id, clerk_user_id, email, first_name, last_name, full_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'seed_user_alice', 'alice@seed.local', 'Alice',  'Admin',   'Alice Admin'),
  ('00000000-0000-0000-0000-000000000002', 'seed_user_bob',   'bob@seed.local',   'Bob',    'Recruit', 'Bob Recruit'),
  ('00000000-0000-0000-0000-000000000003', 'seed_user_carol', 'carol@seed.local', 'Carol',  'VPEng',   'Carol VPEng')
ON CONFLICT (clerk_user_id) DO NOTHING;

-- ── org_members ──────────────────────────────────────────────
INSERT INTO org_members (org_id, user_id, role) VALUES
  ('seed', '00000000-0000-0000-0000-000000000001', 'admin'),
  ('seed', '00000000-0000-0000-0000-000000000002', 'recruiter'),
  ('seed', '00000000-0000-0000-0000-000000000003', 'hiring_manager')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ── departments ──────────────────────────────────────────────
INSERT INTO departments (id, org_id, name, slug) VALUES
  ('10000000-0000-0000-0000-000000000001', 'seed', 'Engineering', 'engineering'),
  ('10000000-0000-0000-0000-000000000002', 'seed', 'Product',     'product')
ON CONFLICT (org_id, name) DO NOTHING;

-- ── locations ────────────────────────────────────────────────
INSERT INTO locations (id, org_id, name, city, state, country, remote_type, timezone) VALUES
  ('20000000-0000-0000-0000-000000000001', 'seed', 'San Francisco HQ', 'San Francisco', 'CA', 'US', 'onsite', 'America/Los_Angeles'),
  ('20000000-0000-0000-0000-000000000002', 'seed', 'Remote, US',        NULL,            NULL, 'US', 'remote', NULL)
ON CONFLICT (org_id, name) DO NOTHING;

-- ── compensation_bands ───────────────────────────────────────
INSERT INTO compensation_bands (id, org_id, name, level, department_id, location_id, min_salary, max_salary, currency) VALUES
  ('30000000-0000-0000-0000-000000000001', 'seed', 'IC4 Engineer — SF', 'IC4',
   '10000000-0000-0000-0000-000000000001',   -- Engineering
   '20000000-0000-0000-0000-000000000001',   -- SF HQ
   160000, 220000, 'USD')
ON CONFLICT DO NOTHING;

-- ── approval_chains ──────────────────────────────────────────
-- One chain for Openings in the Engineering department:
--   Step 0 (sequential):   Hiring Manager approval (resolved dynamically)
--   Step 1 (conditional):  Finance — only if comp_max > 200000
--   Step 2 (sequential):   VP of Engineering (Carol)
INSERT INTO approval_chains (id, org_id, name, description, target_type, scope_conditions, is_active, created_by) VALUES
  ('40000000-0000-0000-0000-000000000001', 'seed', 'Engineering Opening Approval',
   'Default approval chain for engineering openings',
   'opening',
   '{"all":[{"field":"department_id","op":"eq","value":"10000000-0000-0000-0000-000000000001"}]}'::jsonb,
   true,
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ── approval_chain_steps ─────────────────────────────────────
INSERT INTO approval_chain_steps
  (id, chain_id, step_index, name, step_type, parallel_group_id, condition, approver_type, approver_value, min_approvals, sla_hours)
VALUES
  ('41000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001',
   0,
   'Hiring Manager',
   'sequential',
   NULL,
   NULL,
   'hiring_team_member',
   '{"role":"hiring_manager"}'::jsonb,
   1,
   24),

  ('41000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000001',
   1,
   'Finance (high comp only)',
   'sequential',
   NULL,
   '{"all":[{"field":"comp_max","op":"gt","value":200000}]}'::jsonb,
   'user',
   '{"user_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,   -- Alice (admin) stands in for Finance in seed
   1,
   48),

  ('41000000-0000-0000-0000-000000000003',
   '40000000-0000-0000-0000-000000000001',
   2,
   'VP of Engineering',
   'sequential',
   NULL,
   NULL,
   'user',
   '{"user_id":"00000000-0000-0000-0000-000000000003"}'::jsonb,   -- Carol
   1,
   48)
ON CONFLICT (chain_id, step_index) DO NOTHING;
