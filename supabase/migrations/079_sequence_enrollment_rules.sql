-- Event-driven auto-enrollment rules.
-- A rule enrolls a candidate into a target sequence when a trigger event fires:
--   * tag_added   — a tag (trigger_value) is added to a candidate
--   * stage_moved — an application moves to a stage named trigger_value
-- Evaluated by a lightweight poll (scanAutomations) that piggybacks on the
-- queue-processing cron. Idempotent: the enroll step skips anyone already
-- active/paused in the sequence, so re-scanning the same events is harmless.

CREATE TABLE IF NOT EXISTS sequence_enrollment_rules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT '',
  enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  trigger_type  TEXT        NOT NULL,          -- 'tag_added' | 'stage_moved'
  trigger_value TEXT        NOT NULL,          -- tag name, or destination stage name
  sequence_id   UUID        NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrollment_rules_org_trigger
  ON sequence_enrollment_rules (org_id, trigger_type) WHERE enabled;

-- Cursor for the poll engine: how far each trigger scan has already processed.
CREATE TABLE IF NOT EXISTS automation_scan_state (
  scan_key        TEXT        PRIMARY KEY,     -- 'tag_added' | 'stage_moved'
  last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
