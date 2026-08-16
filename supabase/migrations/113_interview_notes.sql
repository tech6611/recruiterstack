-- 113_interview_notes.sql
-- Notetaker / Interview Intelligence (Component 10). The auto-join/transcription
-- bot is external infrastructure; v1 is "bring your own transcript" — a recruiter
-- pastes/uploads the interview transcript and the AI produces a TLDR summary + notes
-- mapped to the ICP competencies. Those notes then auto-fill scorecards (Component 11)
-- and feed conversation analytics (Component 12).
--
-- Columns hang off the existing interviews row (one interview = one capture). JSONB
-- for the structured notes; nothing here is a new enum.

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS transcript    text,
  ADD COLUMN IF NOT EXISTS ai_summary    text,
  ADD COLUMN IF NOT EXISTS ai_notes      jsonb,   -- { competency_notes[], highlights[], concerns[], follow_ups[] }
  ADD COLUMN IF NOT EXISTS ai_notes_at   timestamptz;
