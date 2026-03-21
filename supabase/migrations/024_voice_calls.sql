-- Voice AI phone screen infrastructure
CREATE TABLE IF NOT EXISTS voice_calls (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              TEXT        NOT NULL,
    candidate_id        UUID        REFERENCES candidates(id),
    hiring_request_id   UUID        REFERENCES hiring_requests(id),
    application_id      UUID        REFERENCES applications(id),
    direction           TEXT        NOT NULL DEFAULT 'outbound',
    phone_number        TEXT,
    status              TEXT        NOT NULL DEFAULT 'queued',
    agent_type          TEXT        NOT NULL DEFAULT 'phone_screen',
    duration_seconds    INTEGER,
    started_at          TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    transcript          JSONB,
    summary             TEXT,
    ai_score            SMALLINT,
    ai_recommendation   TEXT,
    recording_url       TEXT,
    vobiz_call_id       TEXT,
    metadata            JSONB       NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_org       ON voice_calls(org_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_candidate  ON voice_calls(candidate_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_application ON voice_calls(application_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_status     ON voice_calls(org_id, status);

CREATE TABLE IF NOT EXISTS voice_agents (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  TEXT        NOT NULL,
    hiring_request_id       UUID        REFERENCES hiring_requests(id),
    name                    TEXT        NOT NULL DEFAULT 'Recruiter',
    system_prompt           TEXT,
    voice_id                TEXT,
    language                TEXT        DEFAULT 'en',
    max_duration_minutes    INTEGER     DEFAULT 15,
    questions               JSONB,
    active                  BOOLEAN     DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_agents_org ON voice_agents(org_id);
