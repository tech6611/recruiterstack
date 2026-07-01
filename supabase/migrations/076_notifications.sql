-- ============================================================
-- 076: In-app notifications table.
--
-- The app has always READ and WRITTEN notifications from code
-- (src/lib/api/notify.ts creates them; GET/PATCH /api/notifications
-- lists and marks them read; the bell menu in the header polls that
-- route) — but no migration ever created the table. In production the
-- table is absent, so every GET /api/notifications returns 500
-- (PostgREST PGRST205 "Could not find the table 'public.notifications'").
--
-- Columns mirror the Notification interface in src/lib/types/database.ts
-- and the insert in src/lib/api/notify.ts exactly. Convention match
-- (migrations 064/065/072): org_id TEXT, RLS enabled with a single
-- service_role_all policy (access is org-scoped in code via the
-- service-role client). Idempotent (IF NOT EXISTS). Reversible: drop
-- the table (notifications are transient, no downstream data depends on them).
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  user_id       TEXT,                                   -- nullable: org-wide when null
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  resource_type TEXT,                                   -- e.g. 'candidate', 'application', 'job'
  resource_id   TEXT,
  read          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bell menu lists newest-first, scoped to org, often filtered to unread.
CREATE INDEX IF NOT EXISTS idx_notifications_org_created ON notifications(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_unread  ON notifications(org_id) WHERE read = false;

-- RLS — org-scoping enforced in code; service role bypasses.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
