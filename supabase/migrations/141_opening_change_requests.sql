-- ============================================================
-- 141: Requisition (opening) changes after approval — Ashby model.
--
-- "Approval protects specific fields, never the whole record."
--   * Ordinary fields on an APPROVED opening save immediately (+ audit + version).
--   * Gated fields create an opening_change_request that runs the opening's
--     approval chain again on the diff. The opening STAYS approved meanwhile,
--     so linked jobs are undisturbed. Approve → applied; reject → discarded.
--   * Every approval / applied change / edit writes an opening_versions row.
--
-- Gated set = org_settings.opening_reapproval_fields (built-ins) ∪ custom
-- field definitions with require_reapproval = true.
-- ============================================================

-- Per-field reapproval flag on custom fields (Ashby: "Require Reapproval").
ALTER TABLE custom_field_definitions
  ADD COLUMN IF NOT EXISTS require_reapproval BOOLEAN NOT NULL DEFAULT false;

-- Org-level gated built-in fields for openings. Hiring manager is NOT gated by
-- default (matches Ashby's default); admins can add 'hiring_manager_id'.
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS opening_reapproval_fields JSONB NOT NULL
  DEFAULT '["comp_min","comp_max","comp_currency","comp_band_id","target_start_date","employment_type","department_id"]'::jsonb;

-- ── opening_versions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             TEXT NOT NULL,
  opening_id         UUID NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  version_no         INT  NOT NULL CHECK (version_no >= 1),
  reason             TEXT NOT NULL
                     CHECK (reason IN ('approved', 'edited', 'change_applied')),
  snapshot           JSONB NOT NULL,                       -- full opening row at this version
  changed_fields     JSONB NOT NULL DEFAULT '[]',          -- [field_key, ...]
  change_request_id  UUID,                                 -- set for 'change_applied'
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (opening_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_opening_versions_opening ON opening_versions(opening_id, version_no DESC);
ALTER TABLE opening_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_opening_versions" ON opening_versions FOR ALL USING (true) WITH CHECK (true);

-- ── opening_change_requests ──────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_change_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  opening_id    UUID NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  previous      JSONB NOT NULL DEFAULT '{}',               -- {field: old}
  proposed      JSONB NOT NULL DEFAULT '{}',               -- {field: new}
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approval_id   UUID,                                      -- approvals.id (target_type='opening_change')
  requested_by  UUID NOT NULL REFERENCES users(id),
  note          TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opening_change_requests_opening ON opening_change_requests(opening_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_opening_change_pending
  ON opening_change_requests (opening_id) WHERE status = 'pending';
CREATE TRIGGER set_opening_change_requests_updated_at
  BEFORE UPDATE ON opening_change_requests
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
ALTER TABLE opening_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_opening_change_requests" ON opening_change_requests FOR ALL USING (true) WITH CHECK (true);

-- ── approvals: allow the new target type ─────────────────────
-- Change requests reuse the opening's approval CHAIN (approval_chains.target_type
-- stays 'opening'); only the approval INSTANCE is typed 'opening_change'.
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_target_type_check;
ALTER TABLE approvals ADD CONSTRAINT approvals_target_type_check
  CHECK (target_type IN ('opening', 'job', 'offer', 'opening_change'));

-- ── approval_chain_steps: 'manager' approver type ────────────
-- The resolver + Zod already support it (HRIS reporting line); the DB check
-- did not, so such a step could never be saved.
ALTER TABLE approval_chain_steps DROP CONSTRAINT IF EXISTS approval_chain_steps_approver_type_check;
ALTER TABLE approval_chain_steps ADD CONSTRAINT approval_chain_steps_approver_type_check
  CHECK (approver_type IN ('user', 'role', 'hiring_team_member', 'group', 'manager'));
