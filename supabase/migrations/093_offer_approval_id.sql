-- ============================================================
-- 093: Wire offers into the approval engine.
--
-- Offers already have the lifecycle statuses ('draft', 'pending_approval',
-- 'approved', ...) from migration 013, but were never connected to the
-- approval engine — no route called submitForApproval and there was no link
-- back to the approval row. This adds that link so an offer's approval can be
-- found, stamped on submit, and cleared on reject/cancel (mirrors
-- openings.approval_id / jobs.approval_id).
--
-- Nullable: an offer only has an approval_id while it's been submitted; back to
-- NULL when rejected, cancelled, or still a draft.
-- ============================================================

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS offers_approval_id_idx ON offers(approval_id);
