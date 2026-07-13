-- Free-typed hiring-manager contact (name + email) on a requisition.
-- The existing `hiring_manager_id` stays as-is: it links a real user and drives
-- approval routing (approver-resolver 'hiring_manager' role). These two new
-- columns are the day-to-day hiring contact whose calendar the sequence token
-- ({{hiring_manager_calendar}}) books against — and they flow down onto the job
-- at creation. Email is required in the UI/submit gate, but kept nullable here so
-- existing draft requisitions aren't invalidated.
ALTER TABLE openings
  ADD COLUMN IF NOT EXISTS hiring_manager_name  TEXT,
  ADD COLUMN IF NOT EXISTS hiring_manager_email TEXT;
