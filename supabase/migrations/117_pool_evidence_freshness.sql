-- 117_pool_evidence_freshness.sql
-- Pool freshness (Component 05, Slice 5e follow-up).
--
-- THE BUG THIS FIXES
-- `current_tenure_months` (migration 115) is computed role-start → NOW. But our
-- evidence stops at whenever the source was written. A résumé last edited in 2019
-- saying "current role since 2015" therefore yields "11 years in seat" in 2026 —
-- eleven years of tenure we have no evidence for.
--
-- That inverts the movability filter, which is the pool's main sourcing signal:
-- "in role ≥ 3 years" preferentially surfaces the records with the OLDEST data,
-- because a stale record keeps accruing imaginary tenure. Measured on the first
-- 108 profiles: 52 claimed 3+ years in seat while their newest evidence was 2+
-- years old, and 46 had no evidence newer than three years.
--
-- THE FIX
-- Separate "when the role started" (a fact) from "how long we have verified they
-- were there" (what we actually know). Staleness itself is NOT stored — it would
-- go stale — only `evidence_as_of`, a fact, from which the app derives freshness.

ALTER TABLE pool_profiles
  -- Newest date any source asserts about this person. The honest "as of".
  ADD COLUMN IF NOT EXISTS evidence_as_of        date,
  -- Which source produced that newest evidence (pool_sources.key).
  ADD COLUMN IF NOT EXISTS evidence_source       text,
  -- role_start → evidence_as_of. What we can actually stand behind, as opposed
  -- to current_tenure_months, which runs role_start → now and is an assumption.
  ADD COLUMN IF NOT EXISTS tenure_verified_months int,
  -- Two sources name different current employers, so one of them is out of date.
  -- We know a conflict exists without knowing which side is right — surface it
  -- rather than silently picking. 34 of the first 108 profiles are in this state.
  ADD COLUMN IF NOT EXISTS employer_disputed     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pool_profiles.current_tenure_months IS
  'ASSUMED tenure (role start → now). Overstates when the record is stale; prefer tenure_verified_months for ranking.';
COMMENT ON COLUMN pool_profiles.tenure_verified_months IS
  'VERIFIED tenure (role start → evidence_as_of). Never exceeds what a source actually attests.';

-- Freshness is a first-class filter, so it needs an index. Sorting newest-first
-- with nulls last is the common query, hence DESC NULLS LAST.
CREATE INDEX IF NOT EXISTS idx_pool_profiles_evidence
  ON pool_profiles (evidence_as_of DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_disputed
  ON pool_profiles (employer_disputed) WHERE employer_disputed;
