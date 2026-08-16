-- 114_candidate_enrichment.sql
-- Candidate Enrichment (Sourcing Brain, Slice 0). Every incoming résumé is broken
-- into canonical structured fields at ingestion — most importantly a DATED work
-- history, which nothing captured before (parsers flattened it to a single
-- current_title + one experience_years number). This is the substrate the reasoning
-- brain needs for the movability/trajectory read, and the source-agnostic shape that
-- bought vendor data will later conform to (Pool B).

-- Per-role dated work history. One row per past/current role.
CREATE TABLE IF NOT EXISTS candidate_experiences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title        text,
  employer     text,
  location     text,
  start_date   date,               -- normalized to the first of the month; null if unknown
  end_date     date,               -- null when is_current
  is_current   boolean NOT NULL DEFAULT false,
  summary      text,
  sort_order   int NOT NULL DEFAULT 0,   -- 0 = most recent
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_experiences_candidate
  ON candidate_experiences (candidate_id, sort_order);

ALTER TABLE candidate_experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_candidate_experiences" ON candidate_experiences FOR ALL USING (true) WITH CHECK (true);

-- Light education capture + an enrichment marker on the candidate.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS education   jsonb,        -- [{degree, field, school, year}]
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;
