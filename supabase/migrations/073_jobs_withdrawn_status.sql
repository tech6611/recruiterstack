-- ============================================================
-- 073: Add a 'withdrawn' status to canonical jobs.
--
-- "Withdraw" is a recruiter action on a live (status = 'open') job: it takes
-- the role off the market without permanently retiring it. A withdrawn job is
-- distinct from 'approved' (pre-publish) and from 'archived' (terminal): it is
-- a paused-but-revivable stage. Because the public apply route and the apply
-- preview both gate purely on status = 'open', moving a job to 'withdrawn'
-- makes every corresponding apply link defunct automatically.
--
-- Re-publishing a withdrawn job (withdraw → open) reuses the same apply_token
-- (migration 070 only mints when status='open' AND apply_token IS NULL, and
-- keeps the token across transitions), so old links revive on re-publish.
--
-- Status ladder:
--   draft → pending_approval → approved → open → (withdrawn ⇄ open) → closed/archived
--
-- Additive & idempotent: only widens the CHECK constraint; re-runnable.
-- Rollback: restore the prior constraint (without 'withdrawn'). Safe only if
-- no rows currently hold status='withdrawn'.
-- ============================================================

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved',
                    'open', 'withdrawn', 'closed', 'archived'));
