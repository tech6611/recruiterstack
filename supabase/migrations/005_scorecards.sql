-- Interview Scorecards — structured feedback per application
-- Run in Supabase Studio SQL editor

CREATE TYPE scorecard_recommendation AS ENUM ('strong_yes', 'yes', 'maybe', 'no');

CREATE TABLE scorecards (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id   uuid        REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  interviewer_name text        NOT NULL,
  stage_name       text,
  recommendation   scorecard_recommendation NOT NULL,
  scores           jsonb       NOT NULL DEFAULT '[]',
  overall_notes    text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX scorecards_application_id_idx ON scorecards(application_id);

ALTER TABLE scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON scorecards
  FOR ALL TO service_role USING (true);
