-- ============================================================
-- 084: Interviewer daily interview-load limits.
--
-- Adds per-interviewer min/max interviews-per-day preferences to
-- interviewer_preferences (migration 080). Interviewers set these
-- themselves on the no-login /interviewer/[token] page alongside
-- their weekly hours and timezone.
--
--   max_per_day: hard cap. The self-schedule availability engine
--     (src/lib/interviews/availability.ts) hides ALL slots on a day
--     once the interviewer already has this many scheduled interviews
--     that day, so a candidate can never book them past capacity.
--   min_per_day: a soft target only — shown as context to the
--     recruiter. It is NOT enforced (you can't force interviews to
--     exist by hiding slots).
--
-- Both are nullable; NULL means "no limit / not set". Values are a
-- small non-negative count.
--
-- Convention match (migration 080): idempotent (IF NOT EXISTS).
-- Reversible: drop the columns (absence just means no per-day cap).
-- ============================================================

ALTER TABLE interviewer_preferences
  ADD COLUMN IF NOT EXISTS min_per_day INTEGER,
  ADD COLUMN IF NOT EXISTS max_per_day INTEGER;
