-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017: Weighted Scoring Criteria on Hiring Requests
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a JSONB column that stores the per-job scoring rubric used by both
-- the AI scorer (injected into the prompt) and manual interview scorecards.
--
-- Shape of each element:
--   { id: string, name: string, weight: number, description: string | null }
--   weights are integers (percentages), should sum to 100.
--
-- Safe to run on an already-migrated database — will no-op gracefully.

ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS scoring_criteria JSONB;
