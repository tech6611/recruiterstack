-- ============================================================
-- 141: Close the loop — seats have real states, hires fill them,
-- jobs close with a reason (Ashby parity, Phase 2).
--
--   openings: approved → open (when a linked job is published)
--             open     → filled (a candidate on a linked job is hired)
--             open/approved → closed (without a hire, with a reason)
--             archived ↔ unarchive
--   jobs:     open/paused → closed (with a reason; postings come down)
--             archived → unarchive (back to draft-safe 'closed' or prior)
-- ============================================================

ALTER TABLE openings
  ADD COLUMN IF NOT EXISTS opened_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filled_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filled_by_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_reason             TEXT
    CHECK (close_reason IS NULL OR close_reason IN ('filled_elsewhere', 'cancelled', 'budget_withdrawn', 'on_hold', 'duplicate', 'other')),
  ADD COLUMN IF NOT EXISTS close_note               TEXT,
  ADD COLUMN IF NOT EXISTS status_before_archive    TEXT;

CREATE INDEX IF NOT EXISTS idx_openings_filled_by ON openings(filled_by_application_id);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS closed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_reason          TEXT
    CHECK (close_reason IS NULL OR close_reason IN ('filled', 'cancelled', 'on_hold', 'budget_withdrawn', 'other')),
  ADD COLUMN IF NOT EXISTS close_note            TEXT,
  ADD COLUMN IF NOT EXISTS status_before_archive TEXT;

-- Which seat an offer is for (set when the offer is accepted / the hire recorded).
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS opening_id UUID REFERENCES openings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_offers_opening ON offers(opening_id);

-- Backfill: seats behind already-open jobs are open, not merely approved.
UPDATE openings o SET status = 'open', opened_at = COALESCE(o.opened_at, now())
WHERE o.status = 'approved'
  AND EXISTS (SELECT 1 FROM job_openings jo JOIN jobs j ON j.id = jo.job_id
              WHERE jo.opening_id = o.id AND j.status IN ('open', 'paused'));
