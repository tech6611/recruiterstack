-- Store the candidate's current employer so it can be used as a merge field in
-- sequence emails ({{candidate_company}}). Nullable and additive: existing rows
-- are untouched (stay NULL and render blank in emails); new imports/parses
-- populate it going forward.
alter table public.candidates
  add column if not exists current_company text;
