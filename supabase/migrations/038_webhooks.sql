-- ============================================================
-- 038: Webhook Subscriptions + Deliveries
-- Customers declare endpoints + event filters; emitter records
-- deliveries and retries via the existing job_queue table.
-- HMAC-SHA256 signing with a per-subscription secret.
-- ============================================================

-- ── webhook_subscriptions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT NOT NULL,
  name           TEXT NOT NULL,                            -- admin-facing label
  url            TEXT NOT NULL,
  event_types    TEXT[] NOT NULL DEFAULT '{}',             -- e.g. {'opening.approved','job.published'}
  secret         TEXT NOT NULL,                            -- signing secret (return-once at creation)
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_org     ON webhook_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active  ON webhook_subscriptions(org_id, is_active)
  WHERE is_active = true;
-- GIN index for "which subs care about this event?" queries.
CREATE INDEX IF NOT EXISTS idx_webhook_subs_events  ON webhook_subscriptions USING GIN (event_types);

CREATE TRIGGER set_webhook_subs_updated_at
  BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_webhook_subs" ON webhook_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ── webhook_deliveries ───────────────────────────────────────
-- One row per attempted delivery. On failure, the worker
-- re-enqueues a new delivery row via job_queue.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  subscription_id  UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  event_id         UUID NOT NULL,                          -- stable id for dedup on consumer side
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'delivered', 'failed')),
  attempt          INT NOT NULL DEFAULT 0,
  response_status  INT,                                    -- HTTP status code from target
  response_body    TEXT,                                   -- truncated for log inspection
  error            TEXT,                                   -- local error (timeout, DNS, etc.)
  scheduled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org         ON webhook_deliveries(org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub         ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending     ON webhook_deliveries(status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event       ON webhook_deliveries(event_type, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_webhook_deliveries" ON webhook_deliveries FOR ALL USING (true) WITH CHECK (true);
