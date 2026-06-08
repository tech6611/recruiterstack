-- ============================================================
-- 054: HRIS — documents (link-based v1).
--
-- A document record is metadata + a URL pointing to wherever the file actually
-- lives (Google Drive / Dropbox / Notion / etc.). NO file storage yet — that's
-- a deliberate v1 scope decision: ship categorization + visibility + expiry
-- tracking now, add Supabase Storage (storage_path column, nullable) when a
-- customer asks for native uploads. employee_id NULL = org-level (handbook,
-- policy); not-null = per-employee.
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                TEXT NOT NULL,
  employee_id           UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  category              TEXT NOT NULL
                        CHECK (category IN ('offer_letter','id_proof','contract','certification','policy','payslip','tax_form','other')),
  url                   TEXT NOT NULL,
  visibility            TEXT NOT NULL DEFAULT 'employee'
                        CHECK (visibility IN ('employee','admin')),
  uploaded_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_role      TEXT NOT NULL
                        CHECK (uploaded_by_role IN ('admin','employee')),
  expires_at            DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_documents_org_employee_category
  ON hr_documents(org_id, employee_id, category);
CREATE INDEX IF NOT EXISTS idx_hr_documents_org_level
  ON hr_documents(org_id, category) WHERE employee_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_documents_expiring
  ON hr_documents(org_id, expires_at) WHERE expires_at IS NOT NULL;

CREATE TRIGGER set_hr_documents_updated_at
  BEFORE UPDATE ON hr_documents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE hr_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_hr_documents"
  ON hr_documents FOR ALL USING (true) WITH CHECK (true);
