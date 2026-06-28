-- ============================================================
-- 074: Add a reversible 'paused' status to canonical jobs, and
-- redefine 'withdrawn' as the TERMINAL (dead) state.
--
-- Lifecycle redesign (separates "temporarily frozen" from "abandoned"):
--   - PAUSED  — a live (status='open') job temporarily frozen. The public apply
--     route gates on status='open', so a paused job stops accepting applicants
--     automatically. The apply_token is PRESERVED, so RESUMING (paused → open)
--     revives the very same public link. Fully reversible.
--   - WITHDRAWN — terminal/dead. The requisition is abandoned: the /withdraw
--     route clears apply_token so the link can NEVER revive, and live postings
--     are switched off. Distinct from 'archived' (a soft list-hide).
--
-- This replaces the old meaning of 'withdrawn' (which migration 073 treated as
-- a paused-but-revivable stage). That revivable role now belongs to 'paused';
-- 'withdrawn' becomes one-way. The publish route no longer accepts withdrawn →
-- open, and the withdraw route now clears the token.
--
-- Status ladder:
--   draft → pending_approval → approved → open
--           open ⇄ paused                         (pause / resume — reversible)
--           open | paused → withdrawn             (terminal — link killed)
--           open | paused → closed / archived     (terminal)
--
-- Additive & idempotent: only widens the CHECK constraint; re-runnable.
-- Rollback: restore the migration-073 constraint (without 'paused'). Safe only
-- if no rows currently hold status='paused'.
-- ============================================================

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved',
                    'open', 'paused', 'withdrawn', 'closed', 'archived'));
