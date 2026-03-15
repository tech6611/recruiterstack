-- Migration 018: Per-criterion AI ratings on applications
-- Stores the per-criterion breakdown returned by Claude when scoring_criteria is set on the job.
-- Schema: [{ name: string, rating: 1-4, weight: number }]

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_criterion_scores JSONB;
