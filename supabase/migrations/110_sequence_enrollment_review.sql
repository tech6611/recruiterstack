-- 110_sequence_enrollment_review.sql
-- Review-before-send (Component 08, Slice 8b-2). When a recruiter enrolls sourced
-- candidates "for review", the enrollment is HELD (awaiting_review = true) and no
-- send is scheduled. They review/edit the personalized first message, then approve
-- (schedules the first send) or reject (cancels). job_id lets the Source tab show a
-- job's held enrollments. Nothing here touches the auto-send path (8b-1).

ALTER TABLE sequence_enrollments
  ADD COLUMN IF NOT EXISTS awaiting_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_id          uuid;

CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_review
  ON sequence_enrollments (job_id) WHERE awaiting_review = true;
