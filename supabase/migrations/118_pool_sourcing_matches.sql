-- 118_pool_sourcing_matches.sql
-- Cache for "Source the market" (Pool B) results, so an ICP-ranked market search
-- survives a page refresh and doesn't re-score (Fit-Engine per profile) every time —
-- the same reason the own-pool `sourcing_matches` cache exists. One row per (org, job);
-- the whole ranked list is stored as JSONB and replaced on each fresh search.

CREATE TABLE IF NOT EXISTS pool_sourcing_matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  icp_version int,                                   -- staleness: re-search if the ICP moved on
  matches     jsonb NOT NULL DEFAULT '[]'::jsonb,    -- PoolMatch[]
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, job_id)
);

ALTER TABLE pool_sourcing_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_pool_sourcing_matches" ON pool_sourcing_matches FOR ALL USING (true) WITH CHECK (true);
