-- ============================================================
-- 063: WhatsApp provider adapter — support Vobiz alongside the
-- direct Meta Cloud API (the org's Meta business account is blocked,
-- so v1 production traffic routes through Vobiz, whose telephony we
-- already use — see voice_calls.vobiz_call_id).
--
-- Column mapping per provider:
--   provider='meta'  : phone_number_id = Meta phone number id,
--                      waba_id required, access_token = Graph token,
--                      app_secret = webhook HMAC secret.
--   provider='vobiz' : phone_number_id = Vobiz channel_id (their webhook
--                      envelope carries channel_id, so the same routing
--                      lookup works), auth_id = X-Auth-ID, access_token =
--                      X-Auth-Token (encrypted; also the callback HMAC
--                      signing key per Vobiz's validating-callbacks spec),
--                      waba_id/app_secret unused.
-- ============================================================

ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta'
    CHECK (provider IN ('meta', 'vobiz'));

ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS auth_id TEXT;          -- Vobiz X-Auth-ID (identifier, not secret)

ALTER TABLE whatsapp_accounts
  ALTER COLUMN waba_id DROP NOT NULL;             -- Meta-only concept
