-- 156_bet_sample_searches.sql
-- Scoring tab: each bet's sample person is fetched LIVE from Crustdata with exactly the
-- bet's lines (companies, titles, location, years, school…). Each distinct set of lines
-- is one search, remembered here with the people it returned and where the next page
-- starts — so reloading the page, or going back to lines already searched, never pays
-- twice. Every paid fetch is logged in bet_sample_spend, which the per-job daily credit
-- cap is checked against.

CREATE TABLE IF NOT EXISTS bet_sample_searches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  job_id       uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  bet          int  NOT NULL,
  fingerprint  text NOT NULL,                        -- hash of the bet's lines (what was searched)
  criteria     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- the lines, for reading back
  profile_ids  uuid[] NOT NULL DEFAULT '{}',          -- people returned, in the market's order
  next_cursor  text,                                  -- where the next page starts
  total        int,                                   -- how many match in the market
  exhausted    boolean NOT NULL DEFAULT false,
  credits      numeric NOT NULL DEFAULT 0,            -- spent on this search so far
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, job_id, bet, fingerprint)
);

CREATE TABLE IF NOT EXISTS bet_sample_spend (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  bet         int  NOT NULL,
  credits     numeric NOT NULL,
  people      int  NOT NULL DEFAULT 0,
  spent_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bet_sample_spend_job_day ON bet_sample_spend (org_id, job_id, spent_at);

ALTER TABLE bet_sample_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_sample_spend    ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_bet_sample_searches" ON bet_sample_searches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_bet_sample_spend"    ON bet_sample_spend    FOR ALL USING (true) WITH CHECK (true);
