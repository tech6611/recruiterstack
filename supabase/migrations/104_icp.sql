-- 104_icp.sql
-- Ideal Candidate Profile (ICP): the living, versioned "who's great for this
-- role" object the Sifter scores against. Supersedes the flat weighted rubric in
-- jobs.custom_fields->'scoring_criteria' (which stays populated, down-projected
-- from the ICP via icpToScoringCriteria(), so the existing board + scorer keep
-- working untouched). One row PER VERSION — kept as history for audit/rollback,
-- the way Metaview treats an ICP like a product spec.
--
-- Gates (must_haves) + competencies are JSONB: variable-shape and always read
-- with the row, the same choice as scorecards.scores. status/source are TEXT with
-- app-level (Zod) validation — no new enums, matching the 099_interview_plans
-- convention. Embedding is intentionally DEFERRED to the semantic-match slice
-- (Component 06), so this migration needs no pgvector extension.

CREATE TABLE IF NOT EXISTS icps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL,
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version       int  NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'draft',    -- draft | approved | superseded
  source        text NOT NULL DEFAULT 'seed',     -- seed | intake | refinement | manual
  must_haves    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- IcpMustHave[]   (hard gates)
  competencies  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- IcpCompetency[] (weights sum 100)
  changelog     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- IcpChangelogEntry[]
  supersedes_id uuid REFERENCES icps(id) ON DELETE SET NULL,
  created_by    uuid,                                 -- users.id (nullable)
  approved_by   uuid,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, version)
);

-- At most ONE approved ICP per job (the live yardstick). The facade demotes the
-- prior approved row to 'superseded' before promoting a new one; this partial
-- index is the safety net, not the mechanism.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_icps_one_approved_per_job
  ON icps(job_id) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_icps_job ON icps(job_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_icps_org ON icps(org_id);

-- Access is via the service-role server client (RLS bypassed there); enable RLS
-- with a permissive service-role policy, matching the rest of the schema.
ALTER TABLE icps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_icps" ON icps FOR ALL USING (true) WITH CHECK (true);
