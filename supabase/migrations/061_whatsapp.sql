-- ============================================================
-- 061: WhatsApp — two-way conversational messaging via the Meta
-- WhatsApp Business Cloud API.
--
-- Three tables:
--   whatsapp_accounts      — per-org Meta credentials (one row per org for
--                            v1; access_token/app_secret stored AES-encrypted
--                            by the app layer, same as user_integrations).
--   whatsapp_conversations — one thread per (org, candidate phone). Tracks
--                            the 24h customer-service window (last_inbound_at)
--                            and AI-responder guardrail state.
--   whatsapp_messages      — every inbound/outbound message; wa_message_id is
--                            UNIQUE so Meta webhook retries are idempotent.
--
-- Also adds digits_only() + an expression index on people so inbound
-- wa_id (E.164 digits, no '+') can be matched against free-text phone
-- values without rewriting existing data.
-- ============================================================

-- ── whatsapp_accounts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL UNIQUE,        -- Clerk org id
  phone_number_id   TEXT NOT NULL,               -- Meta phone number id (Graph API path segment)
  waba_id           TEXT NOT NULL,               -- WhatsApp Business Account id
  display_phone     TEXT,                        -- human-readable number for the UI
  access_token      TEXT NOT NULL,               -- encrypted (lib/crypto encrypt())
  app_secret        TEXT,                        -- encrypted; per-org Meta app secret for webhook HMAC
  outreach_template TEXT,                        -- approved template name for business-initiated sends
  template_language TEXT NOT NULL DEFAULT 'en',
  status            TEXT NOT NULL DEFAULT 'connected'
                    CHECK (status IN ('connected', 'disconnected', 'error')),
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_accounts_phone_number_id
  ON whatsapp_accounts(phone_number_id);

CREATE TRIGGER set_whatsapp_accounts_updated_at
  BEFORE UPDATE ON whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_whatsapp_accounts" ON whatsapp_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- ── whatsapp_conversations ────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  person_id        UUID REFERENCES people(id),
  candidate_id     UUID REFERENCES candidates(id),
  application_id   UUID REFERENCES applications(id),  -- primary application context for the responder
  wa_phone         TEXT NOT NULL,                     -- E.164 with leading '+'
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'opted_out', 'closed', 'escalated')),
  agent_enabled    BOOLEAN NOT NULL DEFAULT true,     -- recruiter can mute the AI responder
  last_inbound_at  TIMESTAMPTZ,                       -- anchors Meta's 24h customer-service window
  last_outbound_at TIMESTAMPTZ,
  agent_turns      INTEGER NOT NULL DEFAULT 0,        -- responder guardrail counter
  context          JSONB NOT NULL DEFAULT '{}',       -- job title / persona hints for the responder
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, wa_phone)
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_org       ON whatsapp_conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_candidate ON whatsapp_conversations(candidate_id);

CREATE TRIGGER set_whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_whatsapp_conversations" ON whatsapp_conversations
  FOR ALL USING (true) WITH CHECK (true);

-- ── whatsapp_messages ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  org_id          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body            TEXT,
  template_name   TEXT,                              -- set when delivered as a template message
  wa_message_id   TEXT UNIQUE,                       -- Meta message id (wamid.*) — webhook idempotency key
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  sender          TEXT,                              -- 'candidate' | 'agent:scout' | 'agent:responder' | user id
  error           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON whatsapp_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_msg_org  ON whatsapp_messages(org_id);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_whatsapp_messages" ON whatsapp_messages
  FOR ALL USING (true) WITH CHECK (true);

-- ── phone matching helper ─────────────────────────────────────
-- people.phone / candidates.phone are free-text from CV parsers; Meta sends
-- wa_id as E.164 digits without '+'. Match on digits at lookup time instead
-- of rewriting stored data.
CREATE OR REPLACE FUNCTION digits_only(val TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT
AS $$ SELECT regexp_replace(val, '\D', '', 'g') $$;

CREATE INDEX IF NOT EXISTS idx_people_org_phone_digits
  ON people (org_id, digits_only(phone))
  WHERE phone IS NOT NULL;
