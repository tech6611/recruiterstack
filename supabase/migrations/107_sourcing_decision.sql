-- 107_sourcing_decision.sql
-- Cold-start calibration (Component 05, Slice 5b): capture the recruiter's
-- yes/no on a sourced match (before it's in the pipeline), so those decisions can
-- feed the ICP feedback loop (6c) just like pipeline decisions do. The whole point
-- of calibration is learning from a diverse first set — including the "no"s, which
-- would otherwise never create an application and so never be recorded.

ALTER TABLE sourcing_matches
  ADD COLUMN IF NOT EXISTS decision   text,          -- yes | no | maybe (null = undecided)
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid;
