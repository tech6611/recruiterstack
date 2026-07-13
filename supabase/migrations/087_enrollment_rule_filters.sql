-- Per-rule eligibility filters for auto-enrollment.
-- Until now a rule enrolled EVERY candidate whose event matched (e.g. every new
-- applicant). This adds an optional CandidateFilter (same shape the "Bulk filter"
-- enrollment already uses) so a rule can be scoped — e.g. only applicants to a
-- given department/job/stage/tag/status. An empty object means "no filter"
-- (enroll everyone), preserving existing behaviour.
ALTER TABLE sequence_enrollment_rules
  ADD COLUMN IF NOT EXISTS filters JSONB NOT NULL DEFAULT '{}';
