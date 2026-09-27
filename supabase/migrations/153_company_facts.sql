-- 153_company_facts.sql
-- What we know about an EMPLOYER, as opposed to about a person.
--
-- WHY THIS EXISTS. A recruiter filters on the company as much as the candidate —
-- "fintech background", "worked somewhere public", "early-stage experience". None of
-- that is derivable from a person's résumé, which names an employer and nothing else.
-- Juicebox answers those questions from a company database; this is ours.
--
-- WHAT IT DELIBERATELY DOES NOT HOLD. Funding stage and round dates. Wikidata does not
-- carry them reliably, and without them the "Series A through Series G" style of chip
-- cannot be built honestly — it needs a company's funding timeline intersected with a
-- person's tenure. Buying that is a separate decision; this table stays silent on it
-- rather than guessing.
--
-- HEADCOUNT IS SPARSE AND THAT IS RECORDED, NOT HIDDEN. Checked against our own pool:
-- Meta and McKinsey carry an employee count, Flipkart, Razorpay and Shadowfax do not.
-- So `employees` is null far more often than not, and any chip reading it must treat
-- null as "unknown" rather than "small".
--
-- NO org_id. A company's industry is the same fact for every tenant, like
-- brand_domains (migration 151). Writes are service-role only.

CREATE TABLE IF NOT EXISTS company_facts (
  -- normalizeName(employer, 'company') — the same key brand_domains uses, so an
  -- employer resolves to its logo and its facts by one spelling.
  name_norm     text PRIMARY KEY,
  display_name  text,
  wikidata_id   text,
  founded_year  int,
  employees     int,
  -- Wikidata "industry" (P452) labels: Fintech, e-commerce, logistics, consulting.
  industries    text[] NOT NULL DEFAULT '{}',
  country_code  text,
  -- Instance of "public company" (Q891723) or a stock-exchange listing.
  is_public     boolean,
  -- Null domain means "looked, found nothing" — stop asking on every enrichment run.
  note          text,
  checked_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_facts_industries ON company_facts USING gin (industries);

ALTER TABLE company_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_company_facts" ON company_facts FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE company_facts IS
  'Employer attributes for candidate chips and filters. No funding stage: Wikidata has none, and guessing it would be worse than staying silent.';
