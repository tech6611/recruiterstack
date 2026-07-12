-- ============================================================
-- 083: Per-sequence "send first email immediately" flag.
--
-- Adds sequences.send_first_immediately — when true, the FIRST stage
-- of the sequence bypasses the business-hours send window and fires as
-- soon as the candidate is enrolled (e.g. an application confirmation
-- that should arrive right away, even at 3am on a Saturday). Follow-up
-- stages stay windowed (Mon–Fri, 8am–8pm IST by default).
--
-- Default false preserves today's behaviour, where every stage —
-- including the first — is clamped to the send window. ADD COLUMN ...
-- DEFAULT backfills every existing row with false.
--
-- Read/written by the Next.js app directly (src/modules/crm/domain/enroll.ts
-- schedules the first stage; PATCH /api/sequences/[id] toggles the flag).
-- Additive, reversible (drop the column → reverts to always-windowed).
-- Metadata-only change in Postgres 11+ (constant default).
-- ============================================================

ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS send_first_immediately boolean NOT NULL DEFAULT false;
