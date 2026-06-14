-- ============================================================
-- 064: Link applications to canonical jobs/openings (Canonical Slice 3).
--
-- Decouples candidacy from legacy `hiring_requests` for NEW data. There is no
-- row-level `hiring_request → job` mapping to backfill from (verified), so this
-- is forward-only DUAL-WRITE, not a bulk backfill:
--   - Applications created against a canonical `jobs` pipeline populate `job_id`
--     (and optionally `opening_id`).
--   - Applications created via the legacy apply/intake flow keep `hiring_request_id`
--     only. Existing rows are untouched.
--
-- Both new columns are NULLABLE and additive. `hiring_request_id` stays NOT NULL
-- for now; a later cleanup slice relaxes it once a canonical apply path exists.
--
-- Reversible: DROP the two columns (no data loss for legacy rows).
-- ============================================================

ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_id     UUID REFERENCES jobs(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS opening_id UUID REFERENCES openings(id);

CREATE INDEX IF NOT EXISTS idx_applications_job     ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_opening ON applications(opening_id);
