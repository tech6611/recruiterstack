-- ============================================================
-- 044: Add `title` column to users.
-- Surfaces in Settings → General → Recruiter Profile and is
-- captured (optionally) during onboarding.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;
