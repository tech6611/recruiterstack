-- 115_candidate_pool.sql
-- Candidate Pool (Component 05, Slice 5e) — the first-party sourcing pool.
--
-- WHY THIS IS NOT `candidates`
-- `candidates` means "a person this org is working with": it is org-scoped
-- (UNIQUE (org_id, email), migration 045), requires an email, and every list /
-- count / Sifter surface assumes that meaning. The pool is a different asset —
-- a cross-org database of people who have NOT applied anywhere, which an org
-- *subscribes to* the way employers subscribe to a résumé database. Duplicating
-- it per tenant would waste storage and turn one erasure request into a sweep
-- across every org.
--
-- DELIBERATE EXCEPTION: the pool tables below carry NO org_id. This is the first
-- cross-org store in a codebase where requireOrg() scoping is otherwise universal.
-- Access is granted (pool_access_grants), not partitioned, and reads must go
-- through the modules/pool facade, which returns projections — never raw rows —
-- to an org-scoped route. The only tables here WITH org_id are the two that form
-- that boundary: pool_access_grants and pool_unlocks.
--
-- Layering follows docs: raw (pool_documents, append-only) -> resolved
-- (pool_identities + pool_profiles) -> curated (pool_profile_fields, field-level
-- provenance) -> projection (candidates, written only on unlock).
--
-- Conventions match 099/104/114: JSONB for variable-shape values, TEXT + app-level
-- Zod validation instead of new enums, RLS on with a service-role policy.
-- pgvector is already enabled by migration 108.

-- ── Source registry ───────────────────────────────────────────────────────────
-- A source is a ROW, not an enum, so adding GitHub / a vendor feed / a crawled
-- site is configuration rather than a migration. trust_weight drives the fusion
-- precedence policy; enabled=false makes a source's contributions disappear from
-- the resolved view without touching the raw layer (the kill switch).
CREATE TABLE IF NOT EXISTS pool_sources (
  key            text PRIMARY KEY,              -- 'github' | 'web:resume' | 'vendor:coresignal'
  display_name   text NOT NULL,
  kind           text NOT NULL,                 -- api | crawl | vendor | upload
  trust_weight   int  NOT NULL DEFAULT 50,      -- 0-100; higher wins a field conflict
  retention_days int,                           -- null = no automatic expiry
  enabled        boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pool_sources (key, display_name, kind, trust_weight, notes) VALUES
  ('github',            'GitHub profile',       'api',    70, 'user object: bio, company, location, blog, email'),
  ('web:site',          'Personal website',     'crawl',  55, 'depth-1 crawl of the self-declared website'),
  ('web:resume',        'Résumé / CV document', 'crawl',  85, 'PDF found via the personal site; dated history'),
  ('self_declared',     'Self-declared link',   'crawl',  90, 'link the person published themselves (e.g. LinkedIn)')
ON CONFLICT (key) DO NOTHING;

-- ── RAW: append-only bronze ───────────────────────────────────────────────────
-- Never updated. Lets any extraction rule change be re-derived without re-fetching
-- — which matters when hydration is rate-limited (GitHub: 5k req/hr) or slow (crawl).
CREATE TABLE IF NOT EXISTS pool_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key   text NOT NULL REFERENCES pool_sources(key),
  external_id  text NOT NULL,                   -- github login, resume URL, vendor record id
  url          text,
  content_hash text,                            -- dedupe identical re-fetches
  payload      jsonb,                           -- the untouched response
  fetched_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pool_documents_src ON pool_documents (source_key, external_id);
CREATE INDEX IF NOT EXISTS idx_pool_documents_hash ON pool_documents (content_hash);

-- ── RESOLVED: one row per human ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_profiles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name            text,
  headline                text,
  location_raw            text,
  location_city           text,                 -- normalized (E1)
  current_title           text,
  current_company         text,
  current_company_norm    text,                 -- normalized (E1)
  experience_years        numeric,
  skills                  text[] NOT NULL DEFAULT '{}',
  education               jsonb  NOT NULL DEFAULT '[]'::jsonb,
  -- derived movability (deriveMovability in lib/ai/candidate-enrichment.ts).
  -- Columns not JSONB: sourcing filters on these ("3+ years in seat").
  num_roles               int,
  total_experience_months int,
  current_tenure_months   int,
  avg_tenure_months       int,
  last_move_months_ago    int,
  -- contactability, denormalized for cheap filtering; detail lives in pool_contacts
  has_email               boolean NOT NULL DEFAULT false,
  has_linkedin            boolean NOT NULL DEFAULT false,
  reachable               boolean NOT NULL DEFAULT false,
  sources                 text[] NOT NULL DEFAULT '{}',  -- materialized for search facets
  embedding               vector(768),
  first_seen_at           timestamptz NOT NULL DEFAULT now(),
  last_enriched_at        timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_city   ON pool_profiles (location_city);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_co     ON pool_profiles (current_company_norm);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_reach  ON pool_profiles (reachable);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_tenure ON pool_profiles (current_tenure_months);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_skills ON pool_profiles USING gin (skills);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_srcs   ON pool_profiles USING gin (sources);
-- HNSW rather than ivfflat: this table is a standing pool that grows, and ivfflat
-- with a fixed lists= degrades badly past a few hundred thousand rows.
CREATE INDEX IF NOT EXISTS idx_pool_profiles_embedding
  ON pool_profiles USING hnsw (embedding vector_cosine_ops);

-- One account on one platform. Several identities point at one profile, so a
-- merge is reversible: un-merging is re-pointing an identity, not unpicking a row.
CREATE TABLE IF NOT EXISTS pool_identities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES pool_profiles(id) ON DELETE CASCADE,
  source_key   text NOT NULL REFERENCES pool_sources(key),
  external_id  text NOT NULL,                   -- 'anshul-garg27', a résumé URL, a vendor id
  url          text,
  confidence   text NOT NULL DEFAULT 'high',    -- high | review | ambiguous (Zod-validated)
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, external_id)
);
CREATE INDEX IF NOT EXISTS idx_pool_identities_profile ON pool_identities (profile_id);

-- ── CURATED: field-level provenance ───────────────────────────────────────────
-- The resolved profile above is a projection of these rows under a trust-weighted
-- precedence policy. Without this you cannot answer "why does this say Cisco?",
-- reconcile GitHub against a vendor, or honour an erasure request surgically.
CREATE TABLE IF NOT EXISTS pool_profile_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES pool_profiles(id) ON DELETE CASCADE,
  field       text NOT NULL,                    -- 'current_company' | 'skills' | 'location' ...
  value       jsonb NOT NULL,
  source_key  text NOT NULL REFERENCES pool_sources(key),
  identity_id uuid REFERENCES pool_identities(id) ON DELETE SET NULL,
  confidence  int  NOT NULL DEFAULT 50,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pool_fields_profile ON pool_profile_fields (profile_id, field);
CREATE INDEX IF NOT EXISTS idx_pool_fields_source  ON pool_profile_fields (source_key);

-- Dated work history — same shape as candidate_experiences (migration 114) so a
-- promoted profile copies across without translation.
CREATE TABLE IF NOT EXISTS pool_experiences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES pool_profiles(id) ON DELETE CASCADE,
  title       text,
  employer    text,
  location    text,
  start_date  date,
  end_date    date,
  is_current  boolean NOT NULL DEFAULT false,
  summary     text,
  sort_order  int NOT NULL DEFAULT 0,
  source_key  text NOT NULL REFERENCES pool_sources(key),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pool_experiences_profile ON pool_experiences (profile_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pool_experiences_employer ON pool_experiences (employer);

-- Contact details, deliberately isolated: fastest-decaying data, sharpest
-- compliance handling, and its own retention clock. Deleting a person's
-- contactability is then one table, not a sweep.
CREATE TABLE IF NOT EXISTS pool_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid NOT NULL REFERENCES pool_profiles(id) ON DELETE CASCADE,
  kind                text NOT NULL,            -- email | linkedin | phone | website
  value               text NOT NULL,
  source_key          text NOT NULL REFERENCES pool_sources(key),
  confidence          text NOT NULL DEFAULT 'high',
  observed_at         timestamptz NOT NULL DEFAULT now(),
  retention_expires_at timestamptz,
  UNIQUE (profile_id, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_pool_contacts_profile ON pool_contacts (profile_id);
CREATE INDEX IF NOT EXISTS idx_pool_contacts_expiry  ON pool_contacts (retention_expires_at);

-- ── THE ORG BOUNDARY ──────────────────────────────────────────────────────────
-- The only two tables here that carry org_id. Access is granted, not partitioned.
CREATE TABLE IF NOT EXISTS pool_access_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  tier        text NOT NULL DEFAULT 'trial',    -- trial | standard | unlimited
  unlock_quota int,                             -- null = unlimited
  unlocks_used int NOT NULL DEFAULT 0,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  active      boolean NOT NULL DEFAULT true,
  UNIQUE (org_id)
);

-- Billing mechanism, audit trail, and the record of who has seen whom — one table.
CREATE TABLE IF NOT EXISTS pool_unlocks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  profile_id   uuid NOT NULL REFERENCES pool_profiles(id) ON DELETE CASCADE,
  user_id      uuid,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,  -- the projection
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_pool_unlocks_org ON pool_unlocks (org_id, unlocked_at DESC);

-- ── Semantic recall over the pool ─────────────────────────────────────────────
-- Mirrors match_candidates() (migration 108) but WITHOUT the org filter, because
-- pool rows are not org-scoped. Callers exclude what they already hold.
CREATE OR REPLACE FUNCTION match_pool_profiles(
  query_embedding vector(768),
  match_count     int,
  exclude_ids     uuid[] DEFAULT '{}',
  only_reachable  boolean DEFAULT false
)
RETURNS TABLE (id uuid, distance float)
LANGUAGE sql STABLE AS $$
  SELECT p.id, (p.embedding <=> query_embedding) AS distance
  FROM pool_profiles p
  WHERE p.embedding IS NOT NULL
    AND NOT (p.id = ANY(exclude_ids))
    AND (NOT only_reachable OR p.reachable)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Access is via the service-role server client (RLS bypassed there); permissive
-- service-role policies match the rest of the schema.
ALTER TABLE pool_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_identities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_profile_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_experiences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_access_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_unlocks        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pool_sources"        ON pool_sources        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_documents"      ON pool_documents      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_profiles"       ON pool_profiles       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_identities"     ON pool_identities     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_profile_fields" ON pool_profile_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_experiences"    ON pool_experiences    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_contacts"       ON pool_contacts       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_access_grants"  ON pool_access_grants  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pool_unlocks"        ON pool_unlocks        FOR ALL USING (true) WITH CHECK (true);
