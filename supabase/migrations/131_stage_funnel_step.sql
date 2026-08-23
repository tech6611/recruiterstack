-- 131_stage_funnel_step.sql
--
-- Slice 1b refinement: map each pipeline stage to a canonical "funnel step"
-- (Ashby's "Stage Group"). A job's stage names are custom ("HM Screen", "CEO
-- Intro"), but each one rolls up to a SHARED funnel step ("Recruiter Screen",
-- "Onsite") so reporting and agent logic can reason across jobs in a common
-- vocabulary. The canonical list lives in code (src/lib/pipeline/funnel-steps.ts);
-- this column just stores the chosen step id per stage.
--
-- Free TEXT (like applications.source) rather than a DB enum, so the vocabulary
-- can evolve in code without a migration; the API validates against the canonical
-- list. Nullable — an unmapped stage is allowed (the editor prompts to set one).
-- Backfill maps the seeded default stage names to sensible steps; custom-named
-- stages stay NULL for the recruiter to set.

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS funnel_step TEXT;

UPDATE pipeline_stages SET funnel_step = CASE name
  WHEN 'New lead'     THEN 'sourced'
  WHEN 'Reached out'  THEN 'outreach'
  WHEN 'Replied'      THEN 'engaged'
  WHEN 'Applied'      THEN 'application_review'
  WHEN 'Screening'    THEN 'recruiter_screen'
  WHEN 'Phone Screen' THEN 'recruiter_screen'
  WHEN 'Interview'    THEN 'hiring_manager'
  WHEN 'Offer'        THEN 'offer'
  WHEN 'Hired'        THEN 'hired'
  WHEN 'Rejected'     THEN 'archived'
  WHEN 'Archived'     THEN 'archived'
  ELSE funnel_step
END
WHERE funnel_step IS NULL;
