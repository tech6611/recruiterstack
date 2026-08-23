-- 132_stage_interview_panel.sql
--
-- Interview panel per stage — the single source of truth for "who interviews at
-- this stage" (e.g. the Hiring Manager + skip-level manager), so the automation
-- "Schedule an interview" action can send the candidate a self-schedule link that
-- fits the whole panel's availability, and calendar invites go to all of them.
--
-- Stored as a JSONB array of { name, email } on the stage, edited in the Pipeline
-- Plan editor. Nullable/additive; existing stages get NULL (no panel) until set.
-- The self-schedule machinery (interviews.panel + computeOpenSlots + interviewer_
-- preferences) already consumes this exact shape.

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS interview_panel jsonb;
