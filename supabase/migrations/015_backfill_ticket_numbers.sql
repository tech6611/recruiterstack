-- Migration 015: Ensure ticket_number sequence/trigger/backfill exist
-- Safe to re-run; idempotent.

-- Re-create sequence if it doesn't exist yet (in case 002 was never applied)
CREATE SEQUENCE IF NOT EXISTS hiring_request_seq START 1;

-- Re-create generator function
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v BIGINT;
BEGIN
  v := nextval('hiring_request_seq');
  RETURN 'REQ-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v::TEXT, 3, '0');
END;
$$;

-- Re-create trigger function
CREATE OR REPLACE FUNCTION set_ticket_number_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS trg_set_ticket_number ON hiring_requests;
CREATE TRIGGER trg_set_ticket_number
  BEFORE INSERT ON hiring_requests
  FOR EACH ROW EXECUTE FUNCTION set_ticket_number_on_insert();

-- Add ticket_number column if migration 002 was never applied
ALTER TABLE hiring_requests
  ADD COLUMN IF NOT EXISTS ticket_number TEXT;

-- Backfill any existing rows that are still missing a ticket number
UPDATE hiring_requests
  SET ticket_number = generate_ticket_number()
  WHERE ticket_number IS NULL;

-- Unique constraint (safe if already exists)
ALTER TABLE hiring_requests
  ADD CONSTRAINT IF NOT EXISTS hiring_requests_ticket_number_key UNIQUE (ticket_number);
