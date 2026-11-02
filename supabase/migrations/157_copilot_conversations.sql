-- 157_copilot_conversations.sql
-- Copilot chat history, per user (like ChatGPT's sidebar). Each row is one chat:
-- its title (from the first message) and the full message list as shown in the
-- chat window. Private to the user who started it, within their org.
-- Additive only — no existing table is touched.

CREATE TABLE IF NOT EXISTS copilot_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New chat',
  messages    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user
  ON copilot_conversations (org_id, user_id, updated_at DESC);

-- Chats are private: RLS on with NO policy, so only the server (service role,
-- which bypasses RLS) can read or write them — never the browser's public key.
ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY;
