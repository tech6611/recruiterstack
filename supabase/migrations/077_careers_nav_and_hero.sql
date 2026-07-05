-- ============================================================
-- 077: Careers page — custom hero copy, top-nav links, and footer toggle.
--
-- Builds on 071. Lets each org control the careers hero headline/subheadline,
-- add top-nav links (e.g. "About us", "Our vision") plus a highlighted top-right
-- CTA button, and hide the "Powered by RecruiterStack" footer.
--
-- Additive/reversible & idempotent: re-runnable; rollback = drop the columns.
-- All columns are optional; existing pages keep their current look (the page
-- falls back to the company name as the headline and shows the footer).
-- ============================================================

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS hero_headline    TEXT,
  ADD COLUMN IF NOT EXISTS hero_subheadline TEXT,
  -- Array of { "label": string, "url": string } shown in the top nav.
  ADD COLUMN IF NOT EXISTS nav_links        JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nav_cta_label    TEXT,
  ADD COLUMN IF NOT EXISTS nav_cta_url      TEXT,
  ADD COLUMN IF NOT EXISTS show_powered_by  BOOLEAN NOT NULL DEFAULT true;
