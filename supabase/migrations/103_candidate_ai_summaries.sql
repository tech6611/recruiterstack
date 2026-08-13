-- 103_candidate_ai_summaries.sql
-- Persist AI-generated candidate summaries.
--
-- Until now the summary was generated on demand and never stored (the Django
-- endpoint only returned it; the Next.js code expected a candidates.ai_summary
-- column that was never created). So a summary vanished on reload and had to be
-- regenerated every view. This gives it a proper home.
--
-- A dedicated table (rather than a column on candidates/people): a summary is a
-- recruiting artifact, not core identity, and this lets us record the model and
-- generation time for cost/audit. One current summary per candidate (upserted).

CREATE TABLE IF NOT EXISTS candidate_ai_summaries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL,
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  summary       text NOT NULL,
  model         text,                                   -- e.g. 'gemini-2.5-flash'
  generated_by  uuid,                                   -- users.id who triggered it (nullable)
  generated_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)                                 -- one current summary per candidate
);

CREATE INDEX IF NOT EXISTS idx_candidate_ai_summaries_candidate ON candidate_ai_summaries (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_ai_summaries_org       ON candidate_ai_summaries (org_id);
