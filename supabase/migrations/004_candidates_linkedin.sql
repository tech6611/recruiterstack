-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 004: Add linkedin_url to candidates
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
