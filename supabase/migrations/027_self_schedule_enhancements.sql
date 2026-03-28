-- Add panel members JSONB to interviews for self-schedule availability queries
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS panel JSONB;
