-- 102_interview_plan_round_link.sql
-- Phase D: link a booked interview back to the plan round it fulfills, so the
-- scheduler can track "Round X of Y" progress even if rounds are reordered.

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS plan_round_id UUID;
CREATE INDEX IF NOT EXISTS idx_interviews_plan_round ON interviews(plan_round_id);
