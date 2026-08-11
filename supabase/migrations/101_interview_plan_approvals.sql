-- 101_interview_plan_approvals.sql
-- Phase C2: gate interview-plan changes on Active jobs behind hiring-manager
-- approval. The proposed rounds are parked here (not applied) until decided.
--   pending_rounds: the proposed rounds, as JSON, while awaiting sign-off
--   pending_meta:   { status: 'pending'|'approved'|'rejected', requested_by,
--                     requested_at, approver_user_id, approver_source,
--                     decided_by, decided_at, reason }

ALTER TABLE interview_plans
  ADD COLUMN IF NOT EXISTS pending_rounds jsonb,
  ADD COLUMN IF NOT EXISTS pending_meta   jsonb;
