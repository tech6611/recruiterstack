-- ============================================================
-- 085: Sequence kind — 'drip' vs 'event'.
--
-- Replaces the per-sequence send_first_immediately toggle with a
-- sequence TYPE chosen at creation time:
--
--   drip  — outreach / nurture. EVERY stage (including the first)
--           respects the business-hours send window (Mon–Fri,
--           8am–8pm IST by default). This is the default and matches
--           today's behaviour for existing sequences.
--
--   event — transactional / notification. EVERY stage fires as soon
--           as it's due, bypassing the send window entirely — e.g. a
--           stage-move confirmation (application → interview, offer →
--           hired) that should arrive right away, even off-hours.
--           Unlike the old flag, this is NOT limited to the first
--           email — all stages in an event sequence send instantly.
--
-- Backfill: any sequence that had send_first_immediately = true is a
-- de-facto event sequence, so migrate it to kind = 'event'. The old
-- column is LEFT IN PLACE (not dropped) for deploy-ordering safety;
-- the code stops reading it, and it can be dropped in a later cleanup.
--
-- Read/written by the Next.js app directly (src/modules/crm/domain/enroll.ts
-- + src/lib/api/job-handlers.ts drive scheduling; POST /api/sequences sets
-- kind at creation). Additive, reversible (drop the column → reverts to
-- always-windowed). Metadata-only change in Postgres 11+ (constant default).
-- ============================================================

ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'drip'
    CHECK (kind IN ('drip', 'event'));

-- Migrate existing "send first immediately" sequences to the event kind.
UPDATE sequences
  SET kind = 'event'
  WHERE send_first_immediately = true
    AND kind <> 'event';

-- Let PostgREST pick up the new column immediately.
NOTIFY pgrst, 'reload schema';
