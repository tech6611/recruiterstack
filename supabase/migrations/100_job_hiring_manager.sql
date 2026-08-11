-- 100_job_hiring_manager.sql
-- Phase C1: make the hiring manager a first-class team member — a real user on
-- the job (vs. only a name/email from the intake form). Used as the interview-
-- plan approver and shown in the "Team on this job" roster.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hiring_manager_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_jobs_hiring_manager_user ON jobs(hiring_manager_user_id);
