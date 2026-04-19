-- ============================================================
-- 036: Approval Engine
-- Template (chain + chain_steps) / instance (approval + steps)
-- split. Polymorphic target (opening | job | offer-later).
-- Audit log scoped to this module.
-- ============================================================

-- ── approval_chains ──────────────────────────────────────────
-- Admin-defined templates. Multiple chains can exist per
-- target_type; scope_conditions select which one applies.
CREATE TABLE IF NOT EXISTS approval_chains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  target_type      TEXT NOT NULL
                   CHECK (target_type IN ('opening', 'job', 'offer')),
  scope_conditions JSONB,                                  -- DSL; null = matches all targets
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_chains_org         ON approval_chains(org_id);
CREATE INDEX IF NOT EXISTS idx_approval_chains_lookup      ON approval_chains(org_id, target_type, is_active);

CREATE TRIGGER set_approval_chains_updated_at
  BEFORE UPDATE ON approval_chains
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE approval_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approval_chains" ON approval_chains FOR ALL USING (true) WITH CHECK (true);

-- ── approval_chain_steps ─────────────────────────────────────
-- Template steps. parallel_group_id groups sibling steps
-- that run concurrently. Sequential steps have a null group.
CREATE TABLE IF NOT EXISTS approval_chain_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id           UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  step_index         INT NOT NULL CHECK (step_index >= 0),
  name               TEXT NOT NULL,
  step_type          TEXT NOT NULL DEFAULT 'sequential'
                     CHECK (step_type IN ('sequential', 'parallel')),
  parallel_group_id  UUID,                                 -- steps sharing this run in parallel
  condition          JSONB,                                -- null = unconditional; DSL otherwise
  approver_type      TEXT NOT NULL
                     CHECK (approver_type IN ('user', 'role', 'hiring_team_member', 'group')),
  approver_value     JSONB NOT NULL,                       -- {user_id} | {role} | {role: 'hiring_manager'} | {group_id}
  min_approvals      INT NOT NULL DEFAULT 1 CHECK (min_approvals >= 1),
  sla_hours          INT CHECK (sla_hours IS NULL OR sla_hours > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_chain_steps_chain     ON approval_chain_steps(chain_id, step_index);
CREATE INDEX IF NOT EXISTS idx_chain_steps_group     ON approval_chain_steps(chain_id, parallel_group_id)
  WHERE parallel_group_id IS NOT NULL;

ALTER TABLE approval_chain_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_chain_steps" ON approval_chain_steps FOR ALL USING (true) WITH CHECK (true);

-- ── approvals ────────────────────────────────────────────────
-- An instantiated approval request. Polymorphic target.
-- Only one active (pending) approval per (target_type, target_id)
-- at a time — enforced by partial unique index below.
CREATE TABLE IF NOT EXISTS approvals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT NOT NULL,
  approval_chain_id    UUID NOT NULL REFERENCES approval_chains(id) ON DELETE RESTRICT,
  target_type          TEXT NOT NULL
                       CHECK (target_type IN ('opening', 'job', 'offer')),
  target_id            UUID NOT NULL,                      -- polymorphic; FK enforced by service layer
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  current_step_index   INT NOT NULL DEFAULT 0,
  requested_by         UUID NOT NULL REFERENCES users(id),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_org             ON approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_approvals_target          ON approvals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status          ON approvals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_chain           ON approvals(approval_chain_id);

-- "Only one active approval per target" — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_approvals_active_per_target
  ON approvals (target_type, target_id)
  WHERE status = 'pending';

CREATE TRIGGER set_approvals_updated_at
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approvals" ON approvals FOR ALL USING (true) WITH CHECK (true);

-- ── approval_steps ───────────────────────────────────────────
-- Instance steps. approvers and decisions are resolved/recorded
-- at runtime. `approvers` snapshots user_ids at step-activation
-- so a later org membership change doesn't retroactively alter
-- who was asked.
CREATE TABLE IF NOT EXISTS approval_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id        UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  chain_step_id      UUID NOT NULL REFERENCES approval_chain_steps(id) ON DELETE RESTRICT,
  step_index         INT NOT NULL,
  parallel_group_id  UUID,                                  -- mirrored from template at instantiation
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'skipped', 'not_applicable')),
  approvers          JSONB NOT NULL DEFAULT '[]',           -- array of {user_id}
  decisions          JSONB NOT NULL DEFAULT '[]',           -- array of {user_id, decision, comment, at}
  min_approvals      INT NOT NULL DEFAULT 1,
  due_at             TIMESTAMPTZ,                           -- SLA deadline
  activated_at       TIMESTAMPTZ,                           -- when step became 'pending' actively
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_approval    ON approval_steps(approval_id, step_index);
CREATE INDEX IF NOT EXISTS idx_approval_steps_pending     ON approval_steps(status, due_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approval_steps_chain_step  ON approval_steps(chain_step_id);

ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_approval_steps" ON approval_steps FOR ALL USING (true) WITH CHECK (true);

-- ── approval_audit_log ───────────────────────────────────────
-- Every state change, decision, and mid-approval edit.
-- Scoped to this module (distinct from application_events).
CREATE TABLE IF NOT EXISTS approval_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  approval_id     UUID REFERENCES approvals(id) ON DELETE SET NULL,
  target_type     TEXT,                                    -- denormalized for querying after approval delete
  target_id       UUID,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,  -- null = system action
  action          TEXT NOT NULL,                           -- e.g. 'submitted', 'approved', 'rejected',
                                                           -- 'step_decided', 'edit_cancelled', 'sla_breach'
  from_state      TEXT,
  to_state        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org           ON approval_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_approval      ON approval_audit_log(approval_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target        ON approval_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor         ON approval_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created       ON approval_audit_log(created_at DESC);

ALTER TABLE approval_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_audit_log" ON approval_audit_log FOR ALL USING (true) WITH CHECK (true);

-- ── deferred FKs from migration 035 ──────────────────────────
-- openings.approval_id and jobs.approval_id point here now.
ALTER TABLE openings
  ADD CONSTRAINT openings_approval_id_fkey
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_approval_id_fkey
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;
