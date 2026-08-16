-- 116_icp_sourcing_map.sql
-- The Sourcing Brain's reasoning (Slice 1). Stores HOW the JD was dissected into an
-- ICP — the "why this ICP" narrative, the requirement decomposition (hard filter /
-- ranking signal / screen-later), and the inferred unwritten filters. This is what a
-- recruiter/hiring manager reads to understand and argue with the first ICP.

ALTER TABLE icps
  ADD COLUMN IF NOT EXISTS sourcing_map jsonb;   -- SourcingMap (reasoning + decomposition + unwritten_filters)
