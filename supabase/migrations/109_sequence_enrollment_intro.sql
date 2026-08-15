-- 109_sequence_enrollment_intro.sql
-- Personalized outreach (Component 08, Slice 8b-1). A per-enrollment override for
-- the FIRST message, so a candidate enrolled from sourcing gets an intro written
-- from their Fit-Engine evidence ("here's why we're reaching out") instead of the
-- generic stage template. The sequence_email handler prefers these over the stage's
-- subject/body for stage order_index 0; every later stage uses the shared template.

ALTER TABLE sequence_enrollments
  ADD COLUMN IF NOT EXISTS intro_subject text,
  ADD COLUMN IF NOT EXISTS intro_body    text;
