-- ============================================================
-- 142: Hiring team parity (Phase 3).
--   * Two more roles on the requisition: recruiting coordinator + sourcer.
--     (Hiring manager + recruiter already exist.) The job's "Team on this
--     job" card derives all four from the requisition — the requisition
--     stays the single source of truth for people.
--   * Roles grant job access (see src/lib/rbac.ts getViewerScope.jobIds).
-- ============================================================

ALTER TABLE openings
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sourcer_id     UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_openings_coordinator ON openings(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_openings_sourcer     ON openings(sourcer_id);
