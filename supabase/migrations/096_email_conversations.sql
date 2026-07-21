-- ============================================================
-- 096: Two-way email conversations — lets recruiters (and the AI
-- responder) have real back-and-forth email threads with candidates
-- who reply to sequence emails.
--
-- Two tables (mirrors the WhatsApp two-way design in migration 061):
--   email_conversations — one thread per (org, sequence enrollment).
--                         Tracks the AI-responder guardrail state and
--                         read/unread status for the Inbox UI.
--   email_messages      — every inbound (candidate) / outbound (agent or
--                         recruiter) email in the thread. provider_message_id
--                         is UNIQUE so SendGrid Inbound Parse retries are
--                         idempotent.
--
-- Sequence emails are threaded via a Reply-To of
--   reply+<enrollment_id>@reply.recruiterstack.in
-- so an inbound reply maps straight back to its enrollment, and from
-- there to the candidate / application / person.
-- ============================================================

-- ── email_conversations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  enrollment_id    UUID REFERENCES sequence_enrollments(id) ON DELETE SET NULL,
  sequence_id      UUID REFERENCES sequences(id) ON DELETE SET NULL,
  candidate_id     UUID REFERENCES candidates(id),
  application_id   UUID REFERENCES applications(id),
  person_id        UUID REFERENCES people(id),
  subject          TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'replied', 'closed', 'archived')),
  agent_enabled    BOOLEAN NOT NULL DEFAULT true,   -- AI auto-responder on/off per thread
  last_inbound_at  TIMESTAMPTZ,                     -- most recent candidate reply
  last_outbound_at TIMESTAMPTZ,                     -- most recent agent/recruiter send
  unread           BOOLEAN NOT NULL DEFAULT false,  -- true after an inbound the recruiter hasn't seen
  agent_turns      INTEGER NOT NULL DEFAULT 0,      -- responder loop guardrail counter
  context          JSONB NOT NULL DEFAULT '{}',     -- job title / persona hints for the responder
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, enrollment_id)
);

CREATE INDEX IF NOT EXISTS idx_email_conv_org
  ON email_conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_candidate
  ON email_conversations(candidate_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_org_status_inbound
  ON email_conversations(org_id, status, last_inbound_at DESC);

CREATE TRIGGER set_email_conversations_updated_at
  BEFORE UPDATE ON email_conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE email_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_email_conversations" ON email_conversations
  FOR ALL USING (true) WITH CHECK (true);

-- ── email_messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES email_conversations(id) ON DELETE CASCADE,
  org_id              TEXT NOT NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email          TEXT,
  to_email            TEXT,
  subject             TEXT,
  body_text           TEXT,
  body_html           TEXT,
  sendgrid_message_id TEXT,                          -- x-message-id returned by SendGrid on send
  provider_message_id TEXT UNIQUE,                   -- inbound Message-Id header — idempotency key
  sequence_email_id   UUID REFERENCES sequence_emails(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received', 'sent', 'delivered', 'failed')),
  sender              TEXT,                          -- 'candidate' | 'agent' | user id
  error               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_msg_conv
  ON email_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_msg_org
  ON email_messages(org_id);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_email_messages" ON email_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Tell PostgREST to pick up the new tables.
NOTIFY pgrst, 'reload schema';
