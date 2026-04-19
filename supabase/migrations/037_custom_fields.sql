-- ============================================================
-- 037: Custom Field Definitions
-- Per-org metadata: what fields to render on Opening/Job/Posting
-- forms beyond the built-ins. Values live in the target row's
-- custom_fields JSONB column (keyed by field_key).
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  object_type  TEXT NOT NULL
               CHECK (object_type IN ('opening', 'job', 'posting')),
  field_key    TEXT NOT NULL,                              -- stable key stored in JSONB
  label        TEXT NOT NULL,                              -- human display label
  field_type   TEXT NOT NULL
               CHECK (field_type IN ('text', 'number', 'select', 'multi_select',
                                     'date', 'boolean', 'user')),
  options      JSONB,                                      -- [{value, label}] for select/multi_select
  required     BOOLEAN NOT NULL DEFAULT false,
  order_index  INT NOT NULL DEFAULT 0,                     -- form ordering
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, object_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_org_obj  ON custom_field_definitions(org_id, object_type)
  WHERE is_active = true;

CREATE TRIGGER set_custom_fields_updated_at
  BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_custom_fields" ON custom_field_definitions FOR ALL USING (true) WITH CHECK (true);
