-- 151_brand_domains.sql
-- Hand-corrections for the brand-icon resolver (src/lib/brand-icon.ts).
--
-- The resolver answers from code: an alias table for the dirty head, a conservative
-- guess for the rest, a monogram for everything else. That is right for the 866
-- employers and 365 schools we hold today, and it will be wrong for some of them
-- forever — "Peak" is not peak.com, and no amount of cleverness will tell us so.
--
-- This table is the escape hatch: one row overrides one name, without a deploy. It is
-- OPTIONAL — /api/brand-icon degrades to the code tables when it is missing or empty,
-- so nothing breaks before this migration is applied.
--
-- NO org_id. A company's domain is not tenant data; it is the same fact for everyone,
-- like pool_sources (migration 115). Writes are service-role only.

CREATE TABLE IF NOT EXISTS brand_domains (
  name_norm  text NOT NULL,          -- normalizeName(name, kind) — the resolver's key
  kind       text NOT NULL,          -- company | school
  -- NULL is meaningful: "we looked, there is nothing, stop asking and draw the
  -- monogram" — which is the right answer for most K-12 schools.
  domain     text,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (name_norm, kind)
);

ALTER TABLE brand_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_brand_domains" ON brand_domains FOR ALL USING (true) WITH CHECK (true);

-- Seed the corrections we already know are wrong, found by running the resolver over
-- every employer and school in the database.
INSERT INTO brand_domains (name_norm, kind, domain, note) VALUES
  ('shaastra',   'company', NULL, 'IIT Madras student festival, not an employer'),
  ('chennai36',  'company', NULL, 'IIT Madras hostel, not an employer'),
  ('sct college','company', NULL, 'college listed in the employer field'),
  ('peak',       'company', NULL, 'ambiguous single word; peak.com is a different company'),
  ('granular',   'company', NULL, 'ambiguous single word'),
  ('various startups', 'company', NULL, 'not an organisation')
ON CONFLICT (name_norm, kind) DO NOTHING;
