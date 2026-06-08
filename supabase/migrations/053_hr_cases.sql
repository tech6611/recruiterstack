-- ============================================================
-- 053: HRIS — HR cases (lightweight helpdesk, agentic-first by design).
--
-- The differentiator from typical HR helpdesks (Zoho, Freshteam, etc.): when a
-- case is submitted, the HRIS sub-agent takes a first pass at answering from
-- the unified person/employee data. Most leave-balance / comp / policy /
-- manager-lookup questions are answerable from data the agent already has
-- access to. Only the genuinely-human questions escalate to HR. The
-- ai_attempted_at column records whether/when this happened.
--
-- Tables: hr_cases (one per request) + hr_case_messages (the threaded
-- conversation; first message is usually the AI's answer with author_role='agent').
-- ============================================================

-- ── hr_cases ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_cases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                TEXT NOT NULL,
  requester_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_employee_id UUID REFERENCES employee_profiles(id) ON DELETE SET NULL,
  category              TEXT NOT NULL
                        CHECK (category IN ('leave', 'comp', 'benefits', 'docs', 'manager', 'onboarding', 'other')),
  subject               TEXT NOT NULL,
  body                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  sla_due_at            TIMESTAMPTZ NOT NULL,
  ai_attempted_at       TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  resolved_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  satisfaction_rating   INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_cases_org_status      ON hr_cases(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_cases_requester       ON hr_cases(requester_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_cases_assignee        ON hr_cases(assigned_to_user_id, status)
  WHERE assigned_to_user_id IS NOT NULL AND status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_hr_cases_sla_breach      ON hr_cases(sla_due_at)
  WHERE status IN ('open', 'in_progress');

CREATE TRIGGER set_hr_cases_updated_at
  BEFORE UPDATE ON hr_cases
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE hr_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_hr_cases"
  ON hr_cases FOR ALL USING (true) WITH CHECK (true);

-- ── hr_case_messages ─────────────────────────────────────────
-- The threaded conversation. The FIRST message is usually the AI's auto-answer
-- (author_role='agent', author_user_id=NULL). Subsequent messages alternate
-- between the employee, HR, and (rarely) further AI clarifications.
CREATE TABLE IF NOT EXISTS hr_case_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  case_id         UUID NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  author_role     TEXT NOT NULL
                  CHECK (author_role IN ('employee', 'hr', 'agent', 'system')),
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_case_messages_case ON hr_case_messages(case_id, created_at ASC);

ALTER TABLE hr_case_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_hr_case_messages"
  ON hr_case_messages FOR ALL USING (true) WITH CHECK (true);
