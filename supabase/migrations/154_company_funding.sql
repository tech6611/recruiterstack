-- 154_company_funding.sql
-- Funding history on top of migration 153, from Exa.
--
-- WHY A SECOND MIGRATION. 153 deliberately stayed silent on funding because Wikidata
-- has no round history and guessing would be worse than a blank. With an Exa key that
-- changed: its answer endpoint returns stage, date, total raised and valuation with
-- citations, so the column can now be filled from something that can be checked.
--
-- CITATIONS ARE STORED, NOT JUST THE NUMBERS. A funding figure without a source is a
-- rumour, and these disagree across providers — Razorpay's headcount came back as
-- 3,465 / 4,035 / 4,486 / 4,665 depending on who you ask. Keeping the URLs means a
-- recruiter can see where a chip came from, and a wrong number can be traced rather
-- than argued about.
--
-- WHAT THE NUMBERS ARE FOR. Buckets, not precision. "Unicorn", "Series B", "Big Tech"
-- are the questions a recruiter filters on; whether a company has 4,486 or 4,665 staff
-- makes no difference to any of them.

ALTER TABLE company_facts
  ADD COLUMN IF NOT EXISTS latest_stage      text,      -- 'Series F', 'IPO', 'Seed'
  ADD COLUMN IF NOT EXISTS latest_round_date date,
  ADD COLUMN IF NOT EXISTS total_raised_usd  bigint,
  ADD COLUMN IF NOT EXISTS valuation_usd     bigint,
  ADD COLUMN IF NOT EXISTS is_unicorn        boolean,
  -- Where each answer came from, newest first. Provenance, the same principle the
  -- pool applies to a person's facts.
  ADD COLUMN IF NOT EXISTS citations         text[] NOT NULL DEFAULT '{}',
  -- Which tier answered: wikidata / enwiki / exa. Lets a later run re-ask only the
  -- ones a cheaper source could not settle.
  ADD COLUMN IF NOT EXISTS enriched_by       text;

CREATE INDEX IF NOT EXISTS idx_company_facts_stage ON company_facts (latest_stage);

COMMENT ON COLUMN company_facts.citations IS
  'Source URLs for the funding figures. Providers disagree; keeping the URL makes a chip auditable rather than asserted.';
