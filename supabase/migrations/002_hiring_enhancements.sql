-- ============================================================
-- Migration 002: Hiring Request Enhancements
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Add new columns
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS ticket_number      TEXT,
  ADD COLUMN IF NOT EXISTS target_companies   TEXT,
  ADD COLUMN IF NOT EXISTS filled_by_recruiter BOOLEAN NOT NULL DEFAULT FALSE;

-- Make hiring_manager_email nullable (optional when recruiter fills form themselves)
ALTER TABLE hiring_requests
  ALTER COLUMN hiring_manager_email DROP NOT NULL;

-- 2. Sequence for forever-running ticket numbers
CREATE SEQUENCE IF NOT EXISTS hiring_request_seq START 1;

-- 3. Function: generates REQ-YYYY-NNN
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v BIGINT;
BEGIN
  v := nextval('hiring_request_seq');
  RETURN 'REQ-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v::TEXT, 3, '0');
END;
$$;

-- 4. Trigger function
CREATE OR REPLACE FUNCTION set_ticket_number_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Attach trigger
DROP TRIGGER IF EXISTS trg_set_ticket_number ON hiring_requests;
CREATE TRIGGER trg_set_ticket_number
  BEFORE INSERT ON hiring_requests
  FOR EACH ROW EXECUTE FUNCTION set_ticket_number_on_insert();

-- 6. Backfill existing rows that have no ticket number
UPDATE hiring_requests
  SET ticket_number = generate_ticket_number()
  WHERE ticket_number IS NULL;

-- 7. Unique constraint
ALTER TABLE hiring_requests
  ADD CONSTRAINT IF NOT EXISTS hiring_requests_ticket_number_key UNIQUE (ticket_number);
