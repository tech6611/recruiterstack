-- 007_org_multitenancy.sql
-- Adds org_id (tenant key) to every data table.
-- Existing rows get org_id = 'seed' so they remain visible as test data.
-- New orgs start with a clean slate (no 'seed' data shows up for them).

ALTER TABLE hiring_requests    ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE candidates         ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE pipeline_stages    ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE applications       ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE application_events ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE scorecards         ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE roles              ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'seed';

CREATE INDEX IF NOT EXISTS idx_hiring_requests_org    ON hiring_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_candidates_org         ON candidates(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org    ON pipeline_stages(org_id);
CREATE INDEX IF NOT EXISTS idx_applications_org       ON applications(org_id);
CREATE INDEX IF NOT EXISTS idx_application_events_org ON application_events(org_id);
CREATE INDEX IF NOT EXISTS idx_scorecards_org         ON scorecards(org_id);
CREATE INDEX IF NOT EXISTS idx_roles_org              ON roles(org_id);
