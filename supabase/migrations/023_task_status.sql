-- Migration 023: Add status field to candidate_tasks
-- Replaces binary completed_at-only tracking with richer status dropdown

ALTER TABLE candidate_tasks
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'to_do'
    CONSTRAINT candidate_tasks_status_check
      CHECK (status IN ('to_do', 'in_progress', 'done', 'blocked'));

-- Backfill: tasks already marked as completed should be 'done'
UPDATE candidate_tasks
  SET status = 'done'
  WHERE completed_at IS NOT NULL AND status = 'to_do';
