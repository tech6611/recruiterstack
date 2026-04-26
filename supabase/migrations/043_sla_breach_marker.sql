-- ============================================================
-- 043: SLA breach marker on approval_steps.
-- Set when escalation emails fire so the worker doesn't double-send.
-- ============================================================

ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS sla_breach_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_approval_steps_sla_due
  ON approval_steps(due_at)
  WHERE status = 'pending' AND due_at IS NOT NULL AND sla_breach_notified_at IS NULL;
