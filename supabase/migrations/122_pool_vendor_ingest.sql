-- 122_pool_vendor_ingest.sql
-- Multi-vendor ingestion for the Candidate Pool (Slice S1).
-- See docs/pool-vendor-ingestion-architecture.md.
--
-- ACQUISITION MODEL: demand-driven buy, shared retention. A client's search
-- triggers the purchase; the bought record joins the cross-org pool permanently and
-- serves every org afterwards. The whole point of this migration is to make
-- "never pay for the same record twice" enforceable in the database rather than in
-- application discipline.
--
-- Everything here is additive. Migration 115 already models claims correctly
-- (pool_profile_fields) with pool_profiles as a projection; this adds the payment
-- ledger, the per-field trust the projection needs once more than one source has an
-- opinion, and the bookkeeping that makes a run auditable.

-- ── THE PAYMENT LEDGER ────────────────────────────────────────────────────────
-- Why this is NOT pool_identities, which has exactly the right unique key:
-- pool_identities.profile_id is NOT NULL, so a row can only exist when a fetch
-- produced a resolvable human. The case that costs money is the other one — a
-- charged fetch (Coresignal deducts credits on HTTP 200) whose record is too thin
-- to resolve. With no row to remember it, the id looks unbought and gets re-bought
-- on every subsequent search, forever.
--
-- So payment and identity are separate facts. This table answers "have we ever paid
-- for this id, and what did we get?"; pool_identities answers "this identity
-- resolved to this human". Only the first is safe to gate spending on.
--
-- It also does two other jobs that need the same primary key:
--   • the claim-lock (below), preventing two concurrent searches double-buying
--   • the refresh clock (last_fetched_at), so a deliberate re-buy is deliberate
CREATE TABLE IF NOT EXISTS pool_vendor_records (
  source_key       text NOT NULL REFERENCES pool_sources(key),
  external_id      text NOT NULL,
  -- NULLABLE, and that is the entire point of the table.
  profile_id       uuid REFERENCES pool_profiles(id) ON DELETE SET NULL,
  -- claimed  — someone is fetching it right now (the lock)
  -- fetched  — paid for, mapped, resolved to a profile
  -- unusable — paid for, returned nothing we could resolve. NEVER buy again.
  -- failed   — the call errored before we were charged; safe to retry
  state            text NOT NULL DEFAULT 'claimed',
  claimed_at       timestamptz NOT NULL DEFAULT now(),
  first_fetched_at timestamptz,
  last_fetched_at  timestamptz,
  fetch_count      int NOT NULL DEFAULT 0,
  credits_spent    int NOT NULL DEFAULT 0,
  PRIMARY KEY (source_key, external_id)
);

-- The stale-claim sweeper: a worker that dies mid-fetch must not wedge an id.
CREATE INDEX IF NOT EXISTS idx_pool_vendor_records_claimed
  ON pool_vendor_records (claimed_at) WHERE state = 'claimed';
-- The refresh scan (§1g): held records past their source's TTL.
CREATE INDEX IF NOT EXISTS idx_pool_vendor_records_refresh
  ON pool_vendor_records (source_key, last_fetched_at) WHERE state = 'fetched';
CREATE INDEX IF NOT EXISTS idx_pool_vendor_records_profile
  ON pool_vendor_records (profile_id);

-- ── RUN BOOKKEEPING + THE CREDIT LEDGER ───────────────────────────────────────
-- ids_matched / ids_owned / ids_bought are the cache-hit numbers. They are the
-- only way to answer "is the pool compounding, or are we just an API proxy?", and
-- they cannot be reconstructed after the fact.
CREATE TABLE IF NOT EXISTS pool_ingest_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key       text NOT NULL REFERENCES pool_sources(key),
  org_id           text,                    -- who triggered the search
  job_id           uuid,                    -- the job it was sourced for, when there is one
  query            jsonb,
  ids_matched      int NOT NULL DEFAULT 0,  -- what the free search returned
  ids_owned        int NOT NULL DEFAULT 0,  -- already in the ledger → free
  ids_bought       int NOT NULL DEFAULT 0,  -- actually collected → paid
  profiles_created int NOT NULL DEFAULT 0,
  profiles_merged  int NOT NULL DEFAULT 0,
  records_unusable int NOT NULL DEFAULT 0,  -- paid for, resolved to nothing
  credits_used     int NOT NULL DEFAULT 0,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  error            text
);
CREATE INDEX IF NOT EXISTS idx_pool_ingest_runs_src ON pool_ingest_runs (source_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_ingest_runs_org ON pool_ingest_runs (org_id, started_at DESC);

-- Per-call spend. Mirrors ai_usage (migration 086) deliberately: same nullable
-- org_id, same estimated-cost column, so "cost per client" is one query shape
-- across both meters. Under demand-driven buying org_id is normally SET — a
-- client's search caused the spend. NULL means a shared pipeline/backfill buy.
CREATE TABLE IF NOT EXISTS pool_vendor_calls (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key         text NOT NULL REFERENCES pool_sources(key),
  org_id             text,
  ingest_run_id      uuid REFERENCES pool_ingest_runs(id) ON DELETE SET NULL,
  endpoint           text NOT NULL,           -- 'search' | 'collect' | 'enrich'
  ok                 boolean NOT NULL DEFAULT true,
  credits            int NOT NULL DEFAULT 0,
  records_returned   int NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pool_vendor_calls_org ON pool_vendor_calls (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_vendor_calls_src ON pool_vendor_calls (source_key, created_at DESC);

-- Reuse factor: how many distinct orgs have seen a bought profile. Above ~2 the
-- shared-retention model pays for itself; at 1 we are an expensive proxy. Cheap to
-- record now, impossible to reconstruct later.
CREATE TABLE IF NOT EXISTS pool_profile_views (
  profile_id    uuid NOT NULL REFERENCES pool_profiles(id) ON DELETE CASCADE,
  org_id        text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, org_id)
);

-- ── PER-FIELD TRUST ───────────────────────────────────────────────────────────
-- pool_sources.trust_weight is one number per source, which cannot say the true
-- thing: a profile vendor is excellent on employment history and mediocre on
-- personal email; GitHub is authoritative on a GitHub login and worthless on
-- tenure. Rows here override the source-level default for one field; no row means
-- fall back to pool_sources.trust_weight.
CREATE TABLE IF NOT EXISTS pool_source_field_trust (
  source_key text NOT NULL REFERENCES pool_sources(key) ON DELETE CASCADE,
  field      text NOT NULL,
  weight     int  NOT NULL CHECK (weight BETWEEN 0 AND 100),
  PRIMARY KEY (source_key, field)
);

-- ── IDEMPOTENCY ───────────────────────────────────────────────────────────────
-- Without this, every re-run of the mapper piles up duplicate claims and silently
-- skews fusion (the same source appears to "vote" many times). Verified safe: the
-- 788 existing claim rows contain zero duplicate tuples.
-- NOTE this is why Claim.observedAt must come from the SOURCE, never from now() —
-- a wall-clock default would make every re-run a new row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pool_field_claim
  ON pool_profile_fields (profile_id, field, source_key, observed_at);

-- Deterministic identity resolution looks a person up by a strong identifier
-- (normalized email / linkedin / phone). pool_contacts is that index; it had no
-- index on the lookup direction.
CREATE INDEX IF NOT EXISTS idx_pool_contacts_lookup ON pool_contacts (kind, value);

-- One source's contribution per profile is replaced wholesale on re-map, so the
-- delete needs to be cheap.
CREATE INDEX IF NOT EXISTS idx_pool_experiences_src ON pool_experiences (profile_id, source_key);

-- ── STAGE-2 GAPS ON THE RAW LAYER ─────────────────────────────────────────────
ALTER TABLE pool_documents
  -- Erasure: without this, forgetPerson() cannot reach the raw payloads and a
  -- deletion request leaves the original vendor JSON sitting in the bronze layer.
  ADD COLUMN IF NOT EXISTS profile_id    uuid REFERENCES pool_profiles(id) ON DELETE CASCADE,
  -- The vendor's own "this record was last refreshed" date. This is what feeds
  -- pool_profiles.evidence_as_of. Miss it and we recreate the bug migration 117
  -- exists to fix — stale records accruing imaginary tenure — at scale, with data
  -- we paid for.
  ADD COLUMN IF NOT EXISTS vendor_updated_at date,
  ADD COLUMN IF NOT EXISTS ingest_run_id uuid REFERENCES pool_ingest_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pool_documents_profile ON pool_documents (profile_id);

-- Backfill the link for the 253 documents already landed, via the identity that
-- shares their (source_key, external_id).
UPDATE pool_documents d
   SET profile_id = i.profile_id
  FROM pool_identities i
 WHERE d.profile_id IS NULL
   AND i.source_key = d.source_key
   AND i.external_id = d.external_id;

-- ── SOURCE REGISTRY ───────────────────────────────────────────────────────────
-- Adding a vendor is a row, not a migration — that was the point of making
-- pool_sources a table in 115. `vendor:mock` is the fixture-backed adapter S1 runs
-- on: it exercises the entire spine without spending a rupee, and stays enabled=false
-- in production. The two real vendors are seeded disabled until a contract exists.
--
-- Trust 65: below self_declared (90), web:resume (85) and upload:cv (88), and below
-- github (70) for identity — but a vendor beats all of them on employment history,
-- which is exactly what pool_source_field_trust is for (see below).
-- retention_days 365: our own TTL for a bought record, independent of the vendor's.
INSERT INTO pool_sources (key, display_name, kind, trust_weight, retention_days, enabled, notes) VALUES
  ('vendor:mock',       'Mock vendor (fixtures)', 'vendor', 65, NULL, false,
   'S1 fixture adapter. Exercises the full ingest spine with no vendor spend.'),
  ('vendor:coresignal', 'Coresignal',             'vendor', 65, 365,  false,
   'Discovery vendor: free /search/es_dsl returns ids, so the pre-buy check is possible.'),
  ('vendor:pdl',        'People Data Labs',       'vendor', 65, 365,  false,
   'Enrichment only: Person Search bills per record returned, so it cannot support check-before-buy.')
ON CONFLICT (key) DO NOTHING;

-- Per-field overrides. A vendor's structured employment history is better than a
-- GitHub bio string; a vendor's contact data is worse than one the person published.
INSERT INTO pool_source_field_trust (source_key, field, weight) VALUES
  ('vendor:mock',       'current_company', 80), ('vendor:mock',       'current_title', 80),
  ('vendor:mock',       'education',       75), ('vendor:mock',       'skills',        60),
  ('vendor:coresignal', 'current_company', 80), ('vendor:coresignal', 'current_title', 80),
  ('vendor:coresignal', 'education',       75), ('vendor:coresignal', 'skills',        60),
  ('vendor:pdl',        'current_company', 75), ('vendor:pdl',        'current_title', 75),
  ('vendor:pdl',        'education',       70), ('vendor:pdl',        'skills',        60),
  -- GitHub's `company` is a freetext bio field ("@acme · ex-Foo") — weak evidence
  -- of employment even though the source is trusted overall.
  ('github',            'current_company', 45), ('github',            'current_title', 40)
ON CONFLICT (source_key, field) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Access is via the service-role server client; permissive service-role policies
-- match the rest of the schema (and all of migration 115).
ALTER TABLE pool_vendor_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_ingest_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_vendor_calls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_profile_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_source_field_trust  ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so drop-then-create keeps the whole
-- migration safely re-runnable (every other statement here already is).
DROP POLICY IF EXISTS "service_role_all_pool_vendor_records"     ON pool_vendor_records;
DROP POLICY IF EXISTS "service_role_all_pool_ingest_runs"        ON pool_ingest_runs;
DROP POLICY IF EXISTS "service_role_all_pool_vendor_calls"       ON pool_vendor_calls;
DROP POLICY IF EXISTS "service_role_all_pool_profile_views"      ON pool_profile_views;
DROP POLICY IF EXISTS "service_role_all_pool_source_field_trust" ON pool_source_field_trust;

CREATE POLICY "service_role_all_pool_vendor_records"     ON pool_vendor_records     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_ingest_runs"        ON pool_ingest_runs        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_vendor_calls"       ON pool_vendor_calls       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_profile_views"      ON pool_profile_views      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_source_field_trust" ON pool_source_field_trust FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE pool_vendor_records IS
  'Payment ledger: have we ever paid for this vendor id, and what did we get? The pre-buy check reads THIS, not pool_identities (whose profile_id is NOT NULL and so cannot record a charged fetch that resolved to nothing).';

NOTIFY pgrst, 'reload schema';
