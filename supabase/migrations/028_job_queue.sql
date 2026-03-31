-- ============================================================
-- 028: Job Queue — persistent, retryable background task system
-- ============================================================

CREATE TABLE IF NOT EXISTS job_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  job_type      TEXT NOT NULL,          -- e.g. 'autopilot', 'ai_summary', 'matching', 'slack_notify'
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 3,
  error         TEXT,                   -- last error message if failed
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- don't process before this time
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the worker: find pending/failed jobs ready to process
CREATE INDEX idx_job_queue_pending ON job_queue (status, scheduled_at)
  WHERE status IN ('pending', 'failed');

-- Index for org-scoped lookups (dashboard/monitoring)
CREATE INDEX idx_job_queue_org ON job_queue (org_id, created_at DESC);

-- Index for cleanup of old completed jobs
CREATE INDEX idx_job_queue_completed ON job_queue (status, completed_at)
  WHERE status IN ('completed', 'dead');
