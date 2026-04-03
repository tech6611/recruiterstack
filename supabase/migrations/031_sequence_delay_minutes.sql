-- ============================================================
-- 031: Add delay_minutes to sequence_stages for fine-grained scheduling
--      and send_at for exact datetime scheduling
-- ============================================================

ALTER TABLE sequence_stages
  ADD COLUMN IF NOT EXISTS delay_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_at TIMESTAMPTZ;

-- send_at: if set, overrides delay_days + delay_minutes with an exact datetime
-- delay_minutes: added to delay_days for relative scheduling (e.g. 2 days + 30 minutes)
