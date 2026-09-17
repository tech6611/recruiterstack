-- Register Crustdata as a pool data source (Slice 1).
--
-- Adding a vendor is a row, not a schema change — that was the point of making
-- pool_sources a table in 115. The adapter (src/modules/pool/vendors/crustdata/)
-- and its registry entry are the code half; this is the data half.
--
-- enabled=false: the adapter is pure and tested, but the live "Acquire" client that
-- calls POST /person/search and spends credits does not exist yet (Slice 2). Kept
-- disabled so no code path can source from Crustdata until that client — and its
-- pre-buy ledger checks — are in place.
--
-- trust_weight 65: same as the other vendors — below self_declared (90), web:resume
-- (85), upload:cv (88) and github (70) for identity, but a vendor beats all of them
-- on structured employment history via pool_source_field_trust below.
-- retention_days 365: our own TTL for a bought record, independent of the vendor's.
INSERT INTO pool_sources (key, display_name, kind, trust_weight, retention_days, enabled, notes) VALUES
  ('vendor:crustdata', 'Crustdata', 'vendor', 65, 365, false,
   'People dataset via POST /person/search. Billed per request (~0.3 credits, verified 2026-09-16), returns full profiles — no free id-only search tier, so pre-buy dedupe must key on crustdata_person_id. Skills/emails/phones require separate Person/Contact Enrich, not search.')
ON CONFLICT (key) DO NOTHING;

-- Per-field overrides: Crustdata's structured employment history and education beat a
-- GitHub bio string; skills (which only arrive via enrich) stay modest.
INSERT INTO pool_source_field_trust (source_key, field, weight) VALUES
  ('vendor:crustdata', 'current_company', 80),
  ('vendor:crustdata', 'current_title',   80),
  ('vendor:crustdata', 'education',       75),
  ('vendor:crustdata', 'skills',          60)
ON CONFLICT (source_key, field) DO NOTHING;
