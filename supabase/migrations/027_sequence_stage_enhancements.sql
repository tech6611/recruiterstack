-- Sequence stage enhancements:
-- 1. Channel selection per stage (email, whatsapp, sms, linkedin)
-- 2. Send time scheduling (time of day + timezone + business days)
-- 3. Conditional logic on follow-up stages (no_reply, no_open, no_click)

ALTER TABLE sequence_stages
  ADD COLUMN IF NOT EXISTS channel             VARCHAR(50)  NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS send_at_time        TIME,
  ADD COLUMN IF NOT EXISTS send_timezone       VARCHAR(50)  NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS delay_business_days BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition           VARCHAR(50);

-- condition values: NULL (unconditional), 'no_reply', 'no_open', 'no_click'
-- channel values: 'email', 'whatsapp', 'sms', 'linkedin'
