-- Migration 012: Composite indexes for common query patterns
-- These speed up the most frequently hit queries in the app

-- Job pipeline board (most rendered view): fetch all apps for a job grouped by stage
CREATE INDEX IF NOT EXISTS idx_applications_job_stage
  ON applications(hiring_request_id, stage_id);

-- Candidates list with sort by created_at (default sort)
CREATE INDEX IF NOT EXISTS idx_candidates_org_created
  ON candidates(org_id, created_at DESC);

-- Hiring requests list with sort by created_at
CREATE INDEX IF NOT EXISTS idx_hiring_requests_org_created
  ON hiring_requests(org_id, created_at DESC);

-- Applications filtered by org + status (dashboard stats, candidate status counts)
CREATE INDEX IF NOT EXISTS idx_applications_org_status
  ON applications(org_id, status);

-- Application events timeline per application (event feed)
-- Already have idx_app_events_app on (application_id, created_at DESC), this adds org filter
CREATE INDEX IF NOT EXISTS idx_app_events_org
  ON application_events(org_id, created_at DESC);
