-- 123_pipeline_automations.sql
--
-- Slice 1a of "Pipeline Plans & Automation Agents": the data foundation.
--
-- The vision (Ashby-style, adapted): a recruiter sketches a job's funnel once as
-- ordered stages; automation agents then walk each candidate down it. This
-- migration lays ONLY the substrate — no agent runs yet, and nothing user-visible
-- changes. It:
--   1. ZONES the pipeline (lead | active | offer | completed) so a pre-application
--      "Lead zone" can exist ahead of the active pipeline, Ashby-style.
--   2. Gives each candidacy a LIFECYCLE (lead | active | completed). Defaults to
--      'active', so today's sourced/applied candidates are unaffected — the
--      "sourced person lands as a lead" behaviour change is deferred to Slice 5.
--   3. Adds three tables: stage_playbook (the recruiter's plain-English intent per
--      stage), pipeline_automations (the trigger→action rules — a generalization
--      of sequence_enrollment_rules), and automation_runs (an append-only,
--      reversible log of every autonomous action).
--
-- NOTE: seeding the three lead stages (New lead / Reached out / Replied) is
-- deliberately NOT done here. It lands in Slice 1b alongside the Leads view that
-- displays them, so empty lead columns don't appear on existing boards before
-- there's a UI zone to hold them.
--
-- Additive & reversible: every column has a safe default; existing rows are
-- backfilled by category only. Access is via the service-role server client, so
-- each table gets RLS enabled with the permissive service-role policy used across
-- the schema.

-- ── 1. Zone the pipeline stages ─────────────────────────────────────────────
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT 'active'
    CHECK (zone IN ('lead', 'active', 'offer', 'completed'));

-- Marks the active-zone entry stage a lead crosses INTO when promoted, and the
-- lead-zone stage it crosses FROM. Used later by the promote_lead action as the
-- natural human / high-confidence checkpoint. No stage is a gate by default.
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS is_promotion_gate BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing stages by category. Everything defaults to 'active'; only the
-- terminal-ish default stages move out of the active zone. Name-based, matching
-- the 6 seeded defaults (migrations 003 + 066). Custom-named stages stay 'active',
-- which is the safe, correct default (a recruiter can re-zone them in the UI).
UPDATE pipeline_stages SET zone = 'offer'     WHERE zone = 'active' AND name = 'Offer';
UPDATE pipeline_stages SET zone = 'completed' WHERE zone = 'active' AND name IN ('Hired', 'Rejected', 'Archived');

-- ── 2. Lifecycle on the candidacy ───────────────────────────────────────────
-- A candidacy is a 'lead' (sourced/being contacted, pre-application), 'active'
-- (in the real pipeline), or 'completed'. Defaults to 'active' so existing rows
-- and every current create path behave exactly as before.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle IN ('lead', 'active', 'completed'));

CREATE INDEX IF NOT EXISTS idx_applications_lifecycle
  ON applications(org_id, job_id, lifecycle);

-- ── 3a. The stage playbook — the recruiter's sketch, in words ───────────────
-- One row per stage. entry_intent = "what happens when a candidate lands here";
-- advance_criteria = "the rule for moving forward" (the text an agent will later
-- read to decide). next_stage_id = the one legal forward step (no skipping).
CREATE TABLE IF NOT EXISTS stage_playbook (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           text NOT NULL,
  stage_id         uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  entry_intent     text,
  advance_criteria text,
  next_stage_id    uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  reject_to        text NOT NULL DEFAULT 'archive' CHECK (reject_to IN ('archive', 'hold', 'review')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id)
);
CREATE INDEX IF NOT EXISTS idx_stage_playbook_org ON stage_playbook(org_id);

-- ── 3b. Pipeline automations — the trigger→action rules ─────────────────────
-- Generalizes sequence_enrollment_rules: "enrol in a sequence" becomes just one
-- action_type among many. `trigger` stays disciplined (stage_entry is the Ashby
-- model); `mode` is the autonomy dial; `uses_agent` marks a rule whose action is
-- decided by an LLM (advance/reject/where) rather than fixed; `config` holds the
-- action's params and `guardrails` its safety knobs (undo window, confidence
-- floor, requires_feedback, daily cap).
CREATE TABLE IF NOT EXISTS pipeline_automations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_id    uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  trigger     text NOT NULL DEFAULT 'stage_entry'
                CHECK (trigger IN ('stage_entry', 'feedback_complete', 'sla_elapsed')),
  action_type text NOT NULL
                CHECK (action_type IN (
                  'enrol_outreach', 'promote_lead', 'screen', 'send_email',
                  'send_assessment', 'schedule_interview', 'request_availability',
                  'handoff_to_hm', 'move_stage', 'create_offer', 'archive',
                  'request_approval'
                )),
  uses_agent  boolean NOT NULL DEFAULT false,
  mode        text NOT NULL DEFAULT 'auto'
                CHECK (mode IN ('auto', 'suggest', 'approval_required')),
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  guardrails  jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled     boolean NOT NULL DEFAULT true,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_automations_job   ON pipeline_automations(org_id, job_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_automations_stage ON pipeline_automations(stage_id, enabled);

-- ── 3c. Automation runs — every autonomous action, reversible ───────────────
-- Append-only audit + control record. An auto action lands as state='pending'
-- with a commit_at in the near future; the recruiter can cancel it until then
-- (the undo window). `decision`/`rationale`/`confidence` capture what the agent
-- did and why (always surfaced to the recruiter).
CREATE TABLE IF NOT EXISTS automation_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         text NOT NULL,
  automation_id  uuid REFERENCES pipeline_automations(id) ON DELETE SET NULL,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  action_type    text NOT NULL,
  decision       text CHECK (decision IN ('advanced', 'rejected', 'held', 'escalated', 'acted')),
  rationale      text,
  confidence     numeric,
  state          text NOT NULL DEFAULT 'pending'
                   CHECK (state IN ('pending', 'committed', 'cancelled', 'reverted')),
  commit_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_app     ON automation_runs(org_id, application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_pending ON automation_runs(state, commit_at) WHERE state = 'pending';

-- ── RLS: enable + permissive service-role policy (matches the rest of schema) ─
ALTER TABLE stage_playbook       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_stage_playbook"       ON stage_playbook;
DROP POLICY IF EXISTS "service_role_all_pipeline_automations" ON pipeline_automations;
DROP POLICY IF EXISTS "service_role_all_automation_runs"      ON automation_runs;

CREATE POLICY "service_role_all_stage_playbook"       ON stage_playbook       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pipeline_automations" ON pipeline_automations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_automation_runs"      ON automation_runs      FOR ALL USING (true) WITH CHECK (true);
