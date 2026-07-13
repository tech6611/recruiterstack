-- ============================================================
-- 085: Canonical job link for voice (phone-screen) tables.
--
-- Voice calls + agents were anchored only on the legacy
-- `hiring_request_id` (FK → hiring_requests). Add a canonical
-- `job_id` (FK → jobs) so phone screens work for canonical jobs,
-- matching applications/interviews (a row sets one anchor; the
-- legacy column stays nullable and will be dropped with
-- hiring_requests once nothing references it).
--
-- Additive, nullable, reversible (drop the columns). Idempotent.
-- ============================================================

ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);

CREATE INDEX IF NOT EXISTS idx_voice_calls_job_id  ON voice_calls (job_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_job_id ON voice_agents (job_id);
