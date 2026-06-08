-- ============================================================
-- 052: HRIS — onboarding workflows (Tier 2 of the Zoho People comparison).
--
-- Template + instance model (same shape as approval_chains):
--   onboarding_templates           — reusable checklists per org
--   onboarding_template_tasks      — the tasks inside a template (ordered)
--   onboarding_plans               — one per new hire, instantiated from a template
--   onboarding_tasks               — snapshotted from template tasks at plan creation
--                                    (so editing the template later doesn't mutate
--                                    in-flight plans — same idea as approval_steps).
--
-- Roles (v1): 'new_hire' (the employee themselves) or 'admin' (HR/manager).
-- Due dates are computed at plan creation from a relative offset to start_date
-- (Day 1, Day 7, etc.) so a plan stays meaningful regardless of when it was
-- applied.
--
-- A seed runs at the bottom: for any org that doesn't already have a default
-- template, insert one "Standard onboarding" template with ~6 generic tasks.
-- Idempotent; safe to re-run.
-- ============================================================

-- ── onboarding_templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_org    ON onboarding_templates(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_templates_default
  ON onboarding_templates(org_id) WHERE is_default = true;

CREATE TRIGGER set_onboarding_templates_updated_at
  BEFORE UPDATE ON onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_onboarding_templates"
  ON onboarding_templates FOR ALL USING (true) WITH CHECK (true);

-- ── onboarding_template_tasks ────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  assignee_role    TEXT NOT NULL DEFAULT 'new_hire'
                   CHECK (assignee_role IN ('new_hire', 'admin')),
  due_offset_days  INTEGER NOT NULL DEFAULT 0,         -- relative to plan start_date
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_template
  ON onboarding_template_tasks(template_id, sort_order);

ALTER TABLE onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_onboarding_template_tasks"
  ON onboarding_template_tasks FOR ALL USING (true) WITH CHECK (true);

-- ── onboarding_plans ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  employee_id   UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,                          -- snapshotted at creation
  start_date    DATE NOT NULL,                          -- anchor for relative due dates
  status        TEXT NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  started_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_plans_org_status ON onboarding_plans(org_id, status);
CREATE INDEX IF NOT EXISTS idx_onboarding_plans_employee   ON onboarding_plans(employee_id, started_at DESC);

-- At most one in-progress plan per employee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_plans_live_per_employee
  ON onboarding_plans(employee_id) WHERE status = 'in_progress';

CREATE TRIGGER set_onboarding_plans_updated_at
  BEFORE UPDATE ON onboarding_plans
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE onboarding_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_onboarding_plans"
  ON onboarding_plans FOR ALL USING (true) WITH CHECK (true);

-- ── onboarding_tasks ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT NOT NULL,
  plan_id        UUID NOT NULL REFERENCES onboarding_plans(id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  assignee_role  TEXT NOT NULL
                 CHECK (assignee_role IN ('new_hire', 'admin')),
  due_date       DATE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'completed')),
  completed_at   TIMESTAMPTZ,
  completed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_plan
  ON onboarding_tasks(plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_plan_status
  ON onboarding_tasks(plan_id, status);

CREATE TRIGGER set_onboarding_tasks_updated_at
  BEFORE UPDATE ON onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_onboarding_tasks"
  ON onboarding_tasks FOR ALL USING (true) WITH CHECK (true);

-- ── seed: one default template per org that doesn't have one ──
-- Inserted on every org that has at least one employee_profile. Idempotent.
INSERT INTO onboarding_templates (org_id, name, description, is_default, is_active)
SELECT DISTINCT ep.org_id, 'Standard onboarding',
       'A generic 2-week onboarding checklist. Edit or replace with a role-specific template.',
       true, true
FROM employee_profiles ep
WHERE NOT EXISTS (
  SELECT 1 FROM onboarding_templates ot
  WHERE ot.org_id = ep.org_id AND ot.is_default = true
);

-- Seed the standard tasks for those default templates that have none yet.
INSERT INTO onboarding_template_tasks (template_id, sort_order, title, description, assignee_role, due_offset_days)
SELECT t.id, v.sort_order, v.title, v.description, v.assignee_role, v.due_offset_days
FROM onboarding_templates t
JOIN (VALUES
  (1, 'Welcome — read the welcome message',
      'Get oriented: check your start-day kickoff message from your manager.',
      'new_hire', 0),
  (2, 'Set up your work accounts',
      'Set up your work email, Slack, and any other team tools.',
      'new_hire', 0),
  (3, 'HR: send the welcome packet',
      'Send the new hire their offer letter, benefits overview, and start-day logistics.',
      'admin', 0),
  (4, 'Schedule a kickoff 1:1 with your manager',
      'Book 30 minutes in your first week to align on goals.',
      'new_hire', 3),
  (5, 'Read the employee handbook',
      'Cover policies, leave, code of conduct, and security basics.',
      'new_hire', 5),
  (6, 'Submit personal & banking details',
      'For payroll and statutory records.',
      'new_hire', 5),
  (7, 'First 1:1 check-in with manager',
      'Manager: verify the new hire has everything they need; surface blockers.',
      'admin', 7),
  (8, 'Complete required compliance training',
      'Security, anti-harassment, code of conduct, etc.',
      'new_hire', 14)
) AS v(sort_order, title, description, assignee_role, due_offset_days) ON true
WHERE t.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM onboarding_template_tasks tt WHERE tt.template_id = t.id
  );
