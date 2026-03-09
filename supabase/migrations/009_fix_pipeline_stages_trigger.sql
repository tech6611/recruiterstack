-- Fix trigger so pipeline stages inherit org_id from the hiring request
CREATE OR REPLACE FUNCTION create_default_pipeline_stages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pipeline_stages (hiring_request_id, org_id, name, order_index, color) VALUES
    (NEW.id, NEW.org_id, 'Applied',      0, 'slate'),
    (NEW.id, NEW.org_id, 'Screening',    1, 'blue'),
    (NEW.id, NEW.org_id, 'Phone Screen', 2, 'violet'),
    (NEW.id, NEW.org_id, 'Interview',    3, 'amber'),
    (NEW.id, NEW.org_id, 'Offer',        4, 'emerald'),
    (NEW.id, NEW.org_id, 'Hired',        5, 'green');
  RETURN NEW;
END;
$$;

-- Fix existing pipeline_stages that have org_id='seed' by copying from hiring_request
UPDATE pipeline_stages ps
SET org_id = hr.org_id
FROM hiring_requests hr
WHERE ps.hiring_request_id = hr.id
  AND ps.org_id = 'seed'
  AND hr.org_id != 'seed';
