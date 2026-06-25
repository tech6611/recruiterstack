-- ============================================================
-- 072: Screening questions / application-form builder (Publish JD, Phase 3a).
--
-- Brings the apply form up to Ashby parity. Three pieces:
--
--   1. screening_questions      — org-scoped REUSABLE question library. Write a
--                                 question once ("Authorized to work in India?"),
--                                 reuse it on any job. Carries field type, choices
--                                 (for select types), and an EEO flag for voluntary
--                                 compliance questions hidden from the hiring team.
--
--   2. screening_form_templates — one row per org: the DEFAULT form every new job
--                                 inherits. Per-JOB forms are NOT stored here — they
--                                 live on `jobs.custom_fields.screening` (the same
--                                 JSONB-on-job pattern intake already uses), so a
--                                 recruiter can override the default per job.
--
--   3. applications answer cols — `screening_answers` (visible to hiring team),
--                                 `eeo_answers` (separate, hidden compliance bucket),
--                                 and `knockout_failed` (a disqualifying answer was
--                                 given). All additive + defaulted, so existing rows
--                                 and the current apply flow keep working untouched.
--
-- Form-field shape (stored in screening_form_templates.fields and
-- jobs.custom_fields.screening.fields), one JSON object per field:
--   {
--     "id":          "<stable id within this form>",
--     "question_id": "<screening_questions.id>" | null,   -- null = inline/ad-hoc
--     "label":       "...",
--     "help_text":   "..." | null,
--     "field_type":  "short_text" | ... ,                 -- mirrors the CHECK below
--     "options":     ["A", "B"],                           -- choices for select types
--     "required":    true | false,
--     "is_eeo":      true | false,
--     "knockout":    { "operator": "eq"|"neq"|"in"|"not_in", "value": <any> } | null,
--     "visible_when":{ "field_id": "<id>", "operator": "...", "value": <any> } | null
--   }
--
-- Convention match (migrations 064/065): org_id TEXT, RLS enabled with a single
-- service_role_all policy (access is org-scoped in code via the service-role
-- client). Idempotent (IF NOT EXISTS). Reversible: drop the two tables and the
-- three application columns (no data loss for existing rows).
-- ============================================================

-- 1. Reusable question library ───────────────────────────────
CREATE TABLE IF NOT EXISTS screening_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  label       TEXT NOT NULL,
  help_text   TEXT,
  field_type  TEXT NOT NULL CHECK (field_type IN (
                'short_text', 'long_text', 'yes_no', 'single_select',
                'multi_select', 'number', 'date', 'file', 'url')),
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- choices for (multi_)select
  is_eeo      BOOLEAN NOT NULL DEFAULT false,        -- voluntary compliance question
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screening_questions_org ON screening_questions(org_id);

-- 2. Org default form template (per-job forms live on jobs.custom_fields) ──
CREATE TABLE IF NOT EXISTS screening_form_templates (
  org_id     TEXT PRIMARY KEY,
  fields     JSONB NOT NULL DEFAULT '[]'::jsonb,     -- ordered form fields (shape above)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Candidate answers + knockout outcome on the application ──
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS screening_answers JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS eeo_answers       JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS knockout_failed   BOOLEAN NOT NULL DEFAULT false;

-- RLS — org-scoping enforced in code; service role bypasses.
ALTER TABLE screening_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_screening_questions"      ON screening_questions      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_screening_form_templates" ON screening_form_templates FOR ALL USING (true) WITH CHECK (true);
