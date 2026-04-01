-- ============================================================
-- 029: User preferences — persists dashboard views, layouts, and
--      widget configs per user across browsers and devices.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  org_id      TEXT NOT NULL,
  key         TEXT NOT NULL,       -- e.g. 'dashboard_views', 'dashboard_active_view', 'right_panel_widgets'
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, org_id, key)
);

-- Fast lookup by user + org
CREATE INDEX idx_user_preferences_lookup ON user_preferences (user_id, org_id);
