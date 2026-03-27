-- Email Sequences: multi-stage automated outreach
-- Matches GEM-style drip campaigns with per-stage analytics

-- 1. Sequences (reusable outreach templates)
CREATE TABLE IF NOT EXISTS sequences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(50)  NOT NULL DEFAULT 'draft',  -- draft | active | archived
    created_by      VARCHAR(255),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_sequences_org ON sequences (org_id);

-- 2. Sequence Stages (individual email steps)
CREATE TABLE IF NOT EXISTS sequence_stages (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  VARCHAR(255) NOT NULL,
    sequence_id             UUID         NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    order_index             SMALLINT     NOT NULL DEFAULT 1,
    delay_days              SMALLINT     NOT NULL DEFAULT 0,   -- days after previous stage
    subject                 VARCHAR(500) NOT NULL,
    body                    TEXT         NOT NULL,
    send_on_behalf_of       VARCHAR(255),                      -- SOBO display name
    send_on_behalf_email    VARCHAR(255),                      -- SOBO reply-to
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_sequence_stages_seq ON sequence_stages (sequence_id, order_index);

-- 3. Sequence Enrollments (candidate ↔ sequence assignment)
CREATE TABLE IF NOT EXISTS sequence_enrollments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              VARCHAR(255) NOT NULL,
    sequence_id         UUID         NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    candidate_id        UUID         NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    application_id      UUID                  REFERENCES applications(id) ON DELETE SET NULL,
    enrolled_by         VARCHAR(255),
    status              VARCHAR(50)  NOT NULL DEFAULT 'active',  -- active | completed | replied | bounced | paused | cancelled
    current_stage_index SMALLINT     NOT NULL DEFAULT 1,
    next_send_at        TIMESTAMPTZ,
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollments_org        ON sequence_enrollments (org_id);
CREATE INDEX idx_enrollments_seq        ON sequence_enrollments (sequence_id);
CREATE INDEX idx_enrollments_candidate  ON sequence_enrollments (candidate_id);
CREATE INDEX idx_enrollments_next_send  ON sequence_enrollments (status, next_send_at)
    WHERE status = 'active';

-- 4. Sequence Emails (every email sent, with tracking)
CREATE TABLE IF NOT EXISTS sequence_emails (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               VARCHAR(255) NOT NULL,
    enrollment_id        UUID         NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
    stage_id             UUID         NOT NULL REFERENCES sequence_stages(id) ON DELETE CASCADE,
    candidate_id         UUID         NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    to_email             VARCHAR(255) NOT NULL,
    subject              VARCHAR(500) NOT NULL,
    body                 TEXT         NOT NULL,
    sendgrid_message_id  VARCHAR(255),
    status               VARCHAR(50)  NOT NULL DEFAULT 'queued',  -- queued | sent | delivered | opened | clicked | replied | bounced | failed
    sent_at              TIMESTAMPTZ,
    opened_at            TIMESTAMPTZ,
    clicked_at           TIMESTAMPTZ,
    replied_at           TIMESTAMPTZ,
    bounced_at           TIMESTAMPTZ,
    open_count           SMALLINT     NOT NULL DEFAULT 0,
    click_count          SMALLINT     NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_seq_emails_enrollment ON sequence_emails (enrollment_id);
CREATE INDEX idx_seq_emails_candidate  ON sequence_emails (candidate_id);
CREATE INDEX idx_seq_emails_sgid       ON sequence_emails (sendgrid_message_id)
    WHERE sendgrid_message_id IS NOT NULL;
