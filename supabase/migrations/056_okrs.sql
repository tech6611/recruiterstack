-- ============================================================
-- 056: HRIS — OKRs (Objectives + Key Results).
--
-- Per-employee objectives with 1–5 key results each. Cycle is free-text
-- (e.g. '2026-Q3', '2026-H1') so orgs can pick their own conventions.
-- Objective progress is computed on read as the average of its KRs' progress —
-- no triggers, no stored aggregate. Same pattern as leave balances.
--
-- v1 deliberately skips: team OKRs, parent rollup hierarchies, weighted KRs,
-- and approval workflows. Those are clean follow-ups on this same shape.
-- ============================================================

-- ── okrs (objectives) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS okrs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT NOT NULL,
  owner_employee_id   UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  cycle               TEXT NOT NULL,                      -- e.g. '2026-Q3'
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('draft','active','achieved','missed','abandoned')),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_okrs_org_cycle
  ON okrs(org_id, cycle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_okrs_owner_cycle
  ON okrs(owner_employee_id, cycle, sort_order);
CREATE INDEX IF NOT EXISTS idx_okrs_org_active
  ON okrs(org_id, status) WHERE status IN ('draft','active');

CREATE TRIGGER set_okrs_updated_at
  BEFORE UPDATE ON okrs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE okrs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_okrs"
  ON okrs FOR ALL USING (true) WITH CHECK (true);

-- ── okr_key_results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS okr_key_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  okr_id          UUID NOT NULL REFERENCES okrs(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  progress        INTEGER NOT NULL DEFAULT 0
                  CHECK (progress >= 0 AND progress <= 100),
  target_metric   TEXT,                                   -- free-text target ("hit $50k MRR", "ship v2")
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_okr_key_results_okr
  ON okr_key_results(okr_id, sort_order);

CREATE TRIGGER set_okr_key_results_updated_at
  BEFORE UPDATE ON okr_key_results
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE okr_key_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_okr_key_results"
  ON okr_key_results FOR ALL USING (true) WITH CHECK (true);
