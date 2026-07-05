-- ============================================================
-- 078: Careers page — custom content sections (Phase B).
--
-- Builds on 071/077. Lets each org add an ordered list of freeform content
-- blocks to their public careers page (between "About" and the footer), so a
-- page can carry a benefits grid, team/story spotlights, prose sections, and a
-- call-to-action banner — the kind of custom content leading career sites have.
--
-- One JSONB column holds the ordered array; each element is a typed block:
--   { "id": string, "type": "text",     "title"?: str, "body": html }
--   { "id": string, "type": "benefits", "title"?: str, "items": [{ "title": str, "body"?: str }] }
--   { "id": string, "type": "story",    "title"?: str, "body"?: html, "image_url"?: str,
--                                        "link_label"?: str, "link_url"?: str }
--   { "id": string, "type": "cta",      "headline": str, "subtext"?: str,
--                                        "button_label"?: str, "button_url"?: str }
-- Array position is the display order.
--
-- Additive/reversible & idempotent: re-runnable; rollback = drop the column.
-- Optional; existing pages render exactly as before (empty list = no sections).
-- ============================================================

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS content_sections JSONB NOT NULL DEFAULT '[]'::jsonb;
