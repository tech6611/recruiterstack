-- Migration 013: Interviews & Offers tables
-- Adds interview scheduling and formal offer management to RecruiterStack.

-- ── Interview type & status enums ──────────────────────────────────────────────

CREATE TYPE interview_type   AS ENUM ('video', 'phone', 'in_person', 'panel', 'technical', 'assessment');
CREATE TYPE interview_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled');

-- ── Interviews ─────────────────────────────────────────────────────────────────

CREATE TABLE interviews (
  id                  uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              text    NOT NULL,

  -- Relations
  application_id      uuid    NOT NULL REFERENCES applications(id)      ON DELETE CASCADE,
  candidate_id        uuid    NOT NULL REFERENCES candidates(id)         ON DELETE CASCADE,
  hiring_request_id   uuid    NOT NULL REFERENCES hiring_requests(id)    ON DELETE CASCADE,
  stage_id            uuid             REFERENCES pipeline_stages(id)    ON DELETE SET NULL,

  -- Core fields
  interviewer_name    text    NOT NULL,
  interview_type      interview_type NOT NULL DEFAULT 'video',
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer     NOT NULL DEFAULT 60,
  location            text,           -- Zoom link, office address, etc.
  notes               text,
  status              interview_status NOT NULL DEFAULT 'scheduled',

  -- Self-schedule support
  self_schedule_token text    UNIQUE,
  self_schedule_expires_at timestamptz,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX interviews_org_id_idx          ON interviews(org_id);
CREATE INDEX interviews_application_id_idx  ON interviews(application_id);
CREATE INDEX interviews_candidate_id_idx    ON interviews(candidate_id);
CREATE INDEX interviews_hiring_request_idx  ON interviews(hiring_request_id);
CREATE INDEX interviews_scheduled_at_idx    ON interviews(scheduled_at);
CREATE INDEX interviews_self_schedule_token ON interviews(self_schedule_token);

-- ── Offer status enum ──────────────────────────────────────────────────────────

CREATE TYPE offer_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'accepted',
  'declined',
  'withdrawn',
  'expired'
);

-- ── Offers ─────────────────────────────────────────────────────────────────────

CREATE TABLE offers (
  id                  uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              text    NOT NULL,

  -- Relations
  application_id      uuid    NOT NULL REFERENCES applications(id)      ON DELETE CASCADE,
  candidate_id        uuid    NOT NULL REFERENCES candidates(id)         ON DELETE CASCADE,
  hiring_request_id   uuid    NOT NULL REFERENCES hiring_requests(id)    ON DELETE CASCADE,

  -- Offer details
  position_title      text    NOT NULL,
  base_salary         numeric,
  bonus               numeric,
  equity              text,           -- e.g. "0.1% vested over 4 years"
  start_date          date,
  expiry_date         date,
  notes               text,
  offer_letter_text   text,

  -- Workflow status
  status              offer_status NOT NULL DEFAULT 'draft',

  -- Audit trail
  created_by          text,           -- recruiter org user reference
  approved_by         text,
  approved_at         timestamptz,
  sent_at             timestamptz,
  responded_at        timestamptz,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX offers_org_id_idx           ON offers(org_id);
CREATE INDEX offers_application_id_idx   ON offers(application_id);
CREATE INDEX offers_candidate_id_idx     ON offers(candidate_id);
CREATE INDEX offers_hiring_request_idx   ON offers(hiring_request_id);
CREATE INDEX offers_status_idx           ON offers(status);

-- ── Extend ApplicationEventType enum ──────────────────────────────────────────
-- (Postgres requires DDL for enum additions)

ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'interview_scheduled';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'interview_completed';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'interview_cancelled';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'offer_created';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'offer_approved';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'offer_sent';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'offer_accepted';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'offer_declined';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'assessment_sent';
ALTER TYPE application_event_type
  ADD VALUE IF NOT EXISTS 'rejected';

-- ── updated_at triggers ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER interviews_updated_at
  BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS (mirrors other tables: org_id gate) ───────────────────────────────────

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers     ENABLE ROW LEVEL SECURITY;

-- All access controlled by org_id at API layer (service-role key used in API routes)
